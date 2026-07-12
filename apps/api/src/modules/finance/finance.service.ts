import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ConfigService } from "../config/config.service";
import { vatTreatmentForClass } from "../../common/tax/vat";
import { zatcaPackage } from "../../common/zatca/zatca.util";
import { ZatcaBillingService } from "./zatca/zatca-billing.service";
import { ZatcaInvoiceRouter } from "./zatca/zatca-invoice.router";

const asJson = (v: unknown) => v as Prisma.InputJsonValue;
const r2 = (n: number) => +n.toFixed(2);
const num = (d: unknown) => (d == null ? 0 : Number(d));

/**
 * الهندسة المالية (المرحلة 4ب): الاعتماد المالي للوثيقة يُولّد آلياً:
 *  1) قيد يومية (JRV) — قيد مزدوج متوازن يُظهر الفصل الائتماني (On/Off-Balance).
 *  2) إشعار مدين (Debit Note) للعميل.
 *  3) فاتورة ضريبية (Tax Invoice) لشركة التأمين بقيمة العمولة + ضريبتها.
 *  4) فتح حساب تحليلي للعميل في شجرة الحسابات (مستوى 3).
 * كل ذلك ذرّياً ضمن transaction واحدة.
 */
@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
    private readonly zatcaBilling: ZatcaBillingService,
    private readonly zatcaRouter: ZatcaInvoiceRouter,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  listVouchers() {
    return this.prisma.voucher.findMany({ orderBy: { createdAt: "desc" } });
  }

  /** الرقم الضريبي للبائع (15 رقماً) — مُشتقّ من السجل التجاري للعرض (يُهيَّأ لاحقاً من الإعدادات). */
  private vatNumber(crNumber: string | null): string {
    const cr = (crNumber ?? "0000000000").replace(/\D/g, "").padEnd(10, "0").slice(0, 10);
    return `3${cr}00003`.slice(0, 15);
  }

  /** شجرة الحسابات (17 رقماً) مرتّبة بالكود. */
  coa() {
    return this.prisma.chartOfAccount.findMany({
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, level: true, isOnBalance: true, isLocked: true, accountType: true, clientId: true },
    });
  }

  /** الفواتير الضريبية مع حزمة ZATCA (Fatoora) لكل فاتورة. */
  async invoices(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { name: true, crNumber: true } });
    const sellerName = tenant?.name ?? "—";
    const vatNumber = this.vatNumber(tenant?.crNumber ?? null);
    const rows = await this.prisma.invoice.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, sequenceNo: true, kind: true, insurerName: true, clientId: true, netAmount: true, vatAmount: true, totalAmount: true, status: true, createdAt: true },
    });
    const clientIds = [...new Set(rows.map((r) => r.clientId).filter((x): x is string => !!x))];
    const clients = clientIds.length ? await this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : [];
    const nameOf = Object.fromEntries(clients.map((c) => [c.id, c.name]));
    return rows.map((inv) => ({
      ...inv,
      kind: inv.kind ?? "COMMISSION",
      party: inv.kind === "FEES" ? (nameOf[inv.clientId ?? ""] ?? "—") : (inv.insurerName ?? "—"), // على العميل (رسوم) أو المؤمِّن (عمولة)
      zatca: zatcaPackage({
        sellerName,
        vatNumber,
        timestamp: new Date(inv.createdAt).toISOString(),
        total: num(inv.totalAmount),
        vat: num(inv.vatAmount),
      }),
    }));
  }

  /**
   * تفاصيل فاتورة لتوليد **وثيقة مطبوعة بهوية المستأجر** (فاتورة ضريبية) — P0+.
   * يجمع بيانات البائع (شركة الوساطة) والطرف والمبالغ وحزمة ZATCA للعرض في وثيقة قابلة للطباعة/PDF.
   */
  async invoiceDocument(tenantId: string, id: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id },
      select: { id: true, sequenceNo: true, kind: true, insurerName: true, clientId: true, policyId: true, netAmount: true, vatAmount: true, totalAmount: true, status: true, createdAt: true },
    });
    if (!inv) throw new NotFoundException("الفاتورة غير موجودة");
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { name: true, crNumber: true, vatNumber: true, unifiedNumber: true, phone: true } });
    const kind = inv.kind ?? "COMMISSION";
    let party = inv.insurerName ?? "—";
    if (kind === "FEES" && inv.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: inv.clientId }, select: { name: true } });
      party = client?.name ?? "—";
    }
    const policy = inv.policyId ? await this.prisma.policy.findFirst({ where: { id: inv.policyId }, select: { sequenceNo: true, productLineCode: true } }) : null;
    const sellerVat = tenant?.vatNumber ?? this.vatNumber(tenant?.crNumber ?? null);
    return {
      invoice: {
        id: inv.id, sequenceNo: inv.sequenceNo, kind, status: inv.status,
        net: num(inv.netAmount), vat: num(inv.vatAmount), total: num(inv.totalAmount),
        issuedAt: new Date(inv.createdAt).toISOString(),
      },
      seller: { name: tenant?.name ?? "—", vatNumber: sellerVat, crNumber: tenant?.crNumber ?? null, unifiedNumber: tenant?.unifiedNumber ?? null, phone: tenant?.phone ?? null },
      party: { name: party, type: kind === "FEES" ? "client" : "insurer" },
      policy: policy ? { sequenceNo: policy.sequenceNo, productLineCode: policy.productLineCode } : null,
      zatca: zatcaPackage({ sellerName: tenant?.name ?? "—", vatNumber: sellerVat, timestamp: new Date(inv.createdAt).toISOString(), total: num(inv.totalAmount), vat: num(inv.vatAmount) }),
    };
  }

  /** الذمم المدينة (المستحقّ على العملاء) من إشعارات المدين، مُجمّعة حسب العميل. */
  async receivables() {
    const [notes, credits] = await Promise.all([
      this.prisma.debitNote.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, sequenceNo: true, clientId: true, policyId: true, netAmount: true, vatAmount: true, settledAmount: true, settledAt: true, createdAt: true },
      }),
      this.prisma.creditNote.findMany({ where: { clientId: { not: null } }, select: { clientId: true, netAmount: true, vatAmount: true } }), // إشعارات دائنة على العملاء فقط (تُستثنى CNC على المؤمِّن)
    ]);
    const clientIds = [...new Set(notes.map((n) => n.clientId).filter((x): x is string => !!x))];
    const clients = clientIds.length
      ? await this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
      : [];
    const nameOf = Object.fromEntries(clients.map((c) => [c.id, c.name]));
    // إشعارات دائنة لكل عميل (قسط مُرتجَع) — تُخصم من مستحقّاته
    const creditByClient = new Map<string, number>();
    for (const c of credits) { const k = c.clientId ?? "—"; creditByClient.set(k, r2((creditByClient.get(k) ?? 0) + num(c.netAmount) + num(c.vatAmount))); }
    const creditsTotal = [...creditByClient.values()].reduce((s, v) => s + v, 0);

    const byClient = new Map<string, { clientId: string; clientName: string; total: number; count: number }>();
    let outstanding = 0;
    let collected = 0;
    for (const n of notes) {
      const gross = num(n.netAmount) + num(n.vatAmount);
      const out = r2(gross - num(n.settledAmount));
      outstanding += out;
      collected += num(n.settledAmount);
      if (out <= 0) continue; // مسدَّد بالكامل — لا يظهر في «المستحقّ حسب العميل»
      const key = n.clientId ?? "—";
      const cur = byClient.get(key) ?? { clientId: key, clientName: nameOf[key] ?? "—", total: 0, count: 0 };
      cur.total += out;
      cur.count += 1;
      byClient.set(key, cur);
    }
    // خصم الإشعارات الدائنة من مستحقّ كل عميل
    for (const [k, credit] of creditByClient) { const cur = byClient.get(k); if (cur) cur.total = r2(Math.max(0, cur.total - credit)); }
    return {
      outstanding: r2(outstanding - creditsTotal),
      collected: r2(collected),
      creditNotes: r2(creditsTotal),
      byClient: [...byClient.values()].filter((c) => c.total > 0).sort((a, b) => b.total - a.total),
      notes: notes.map((n) => {
        const gross = r2(num(n.netAmount) + num(n.vatAmount));
        const settled = r2(num(n.settledAmount));
        return { id: n.id, sequenceNo: n.sequenceNo, clientId: n.clientId, clientName: nameOf[n.clientId ?? ""] ?? "—", total: gross, settled, outstanding: r2(gross - settled), status: settled <= 0 ? "outstanding" : settled >= gross ? "paid" : "partial", createdAt: n.createdAt };
      }),
    };
  }

  /** سند قبض من العميل (RCV) مقابل إشعار مدين — يزيد المُحصَّل ويُنقص الذمم. يمنع تجاوز المستحقّ. */
  async recordReceipt(tenantId: string, userId: string, debitNoteId: string, dto: { amount: number; method?: string; reference?: string; receivedDate?: string }) {
    const note = await this.prisma.debitNote.findFirst({ where: { id: debitNoteId } });
    if (!note) throw new NotFoundException("إشعار المدين غير موجود");
    const gross = r2(num(note.netAmount) + num(note.vatAmount));
    const already = num(note.settledAmount);
    const remaining = r2(gross - already);
    if (remaining <= 0) throw new ConflictException("إشعار المدين مُسدَّد بالكامل");
    if (dto.amount > remaining + 0.001) throw new ConflictException(`المبلغ يتجاوز المتبقّي المستحقّ (${remaining})`);

    const newSettled = r2(already + dto.amount);
    const fullyPaid = newSettled >= gross - 0.001;
    const seq = await this.seq.nextVoucherSeq("RCV");
    const result = await this.prisma.$transaction(async (tx) => {
      const voucher = await tx.voucher.create({
        data: {
          tenantId, type: "RCV", sequenceNo: seq, amount: r2(dto.amount), status: "posted", isAuto: false, reference: debitNoteId,
          lines: asJson({
            description: `تحصيل من العميل مقابل ${note.sequenceNo ?? debitNoteId}`,
            method: dto.method ?? "transfer", ref: dto.reference ?? null, receivedDate: dto.receivedDate ?? null, clientId: note.clientId,
            entries: [
              { account: "01010000000000000", name: "النقد والبنوك", debit: r2(dto.amount), credit: 0 },
              { account: "01030000000000000", name: "ذمم العملاء المدينة", debit: 0, credit: r2(dto.amount) },
            ],
          }),
        },
        select: { id: true, sequenceNo: true, amount: true },
      });
      const updated = await tx.debitNote.update({
        where: { id: debitNoteId },
        data: { settledAmount: newSettled, settledAt: fullyPaid ? new Date() : null },
        select: { id: true, sequenceNo: true, netAmount: true, vatAmount: true, settledAmount: true, settledAt: true },
      });
      return { voucher, note: updated };
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "receipt", entityId: result.voucher.id, meta: { debitNoteId, amount: r2(dto.amount), fullyPaid } });
    const settled = num(result.note.settledAmount);
    return {
      voucher: result.voucher,
      debitNote: { id: result.note.id, sequenceNo: result.note.sequenceNo, total: gross, settled: r2(settled), outstanding: r2(gross - settled), status: settled >= gross - 0.001 ? "paid" : "partial" },
    };
  }

  /** استلام عمولة من المؤمِّن (RCV) — يسجّل المُستلَم ويضبط الحالة (مستلمة/فرق تحصيل). */
  async recordCommissionReceipt(tenantId: string, userId: string, commissionId: string, dto: { amount: number; reference?: string; receivedDate?: string }) {
    const comm = await this.prisma.commission.findFirst({ where: { id: commissionId } });
    if (!comm) throw new NotFoundException("سجلّ العمولة غير موجود");
    const expected = num(comm.amount);
    const already = num(comm.receivedAmount);
    const newReceived = r2(already + dto.amount);
    if (newReceived > expected + 0.001) throw new ConflictException(`المبلغ يتجاوز العمولة المتوقّعة (${r2(expected - already)} متبقّية)`);
    const status = newReceived >= expected - 0.001 ? "received" : "variance"; // مكتمل ⇒ مستلمة، أقلّ ⇒ فرق تحصيل
    const seq = await this.seq.nextVoucherSeq("RCV");
    const result = await this.prisma.$transaction(async (tx) => {
      const voucher = await tx.voucher.create({
        data: {
          tenantId, type: "RCV", sequenceNo: seq, amount: r2(dto.amount), status: "posted", isAuto: false, reference: commissionId,
          lines: asJson({
            description: `استلام عمولة من ${comm.insurerName ?? "المؤمِّن"}`,
            ref: dto.reference ?? null, receivedDate: dto.receivedDate ?? null,
            entries: [
              { account: "01010000000000000", name: "النقد والبنوك", debit: r2(dto.amount), credit: 0 },
              { account: "01040000000000000", name: "عمولات مستحقّة على المؤمِّنين", debit: 0, credit: r2(dto.amount) },
            ],
          }),
        },
        select: { id: true, sequenceNo: true, amount: true },
      });
      const updated = await tx.commission.update({ where: { id: commissionId }, data: { receivedAmount: newReceived, status }, select: { id: true, amount: true, receivedAmount: true, status: true } });
      return { voucher, comm: updated };
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "commission_receipt", entityId: result.voucher.id, meta: { commissionId, amount: r2(dto.amount), status } });
    return { voucher: result.voucher, commission: result.comm };
  }

  /** كشف حساب العميل: القيود (إشعارات مدين) والإشعارات الدائنة والمدفوعات (سندات قبض) برصيد جارٍ. */
  async statement(clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId }, select: { id: true, name: true, code: true } });
    if (!client) throw new NotFoundException("العميل غير موجود");
    const [notes, credits] = await Promise.all([
      this.prisma.debitNote.findMany({ where: { clientId }, orderBy: { createdAt: "asc" }, select: { id: true, sequenceNo: true, netAmount: true, vatAmount: true, createdAt: true } }),
      this.prisma.creditNote.findMany({ where: { clientId }, orderBy: { createdAt: "asc" }, select: { id: true, sequenceNo: true, netAmount: true, vatAmount: true, createdAt: true } }),
    ]);
    const noteIds = notes.map((n) => n.id);
    const receipts = noteIds.length
      ? await this.prisma.voucher.findMany({ where: { type: "RCV", reference: { in: noteIds } }, orderBy: { createdAt: "asc" }, select: { id: true, sequenceNo: true, amount: true, reference: true, createdAt: true } })
      : [];
    type Line = { date: Date; kind: "charge" | "payment" | "credit"; ref: string | null; debit: number; credit: number };
    const lines: Line[] = [
      ...notes.map((n) => ({ date: n.createdAt, kind: "charge" as const, ref: n.sequenceNo, debit: r2(num(n.netAmount) + num(n.vatAmount)), credit: 0 })),
      ...receipts.map((r) => ({ date: r.createdAt, kind: "payment" as const, ref: r.sequenceNo, debit: 0, credit: num(r.amount) })),
      ...credits.map((c) => ({ date: c.createdAt, kind: "credit" as const, ref: c.sequenceNo, debit: 0, credit: r2(num(c.netAmount) + num(c.vatAmount)) })),
    ].sort((a, b) => +a.date - +b.date);
    let balance = 0;
    const rows = lines.map((l) => { balance = r2(balance + l.debit - l.credit); return { ...l, balance }; });
    const charged = r2(notes.reduce((s, n) => s + num(n.netAmount) + num(n.vatAmount), 0));
    const paid = r2(receipts.reduce((s, r) => s + num(r.amount), 0));
    const credited = r2(credits.reduce((s, c) => s + num(c.netAmount) + num(c.vatAmount), 0));
    return { client, rows, summary: { charged, paid, credited, balance: r2(charged - paid - credited) } };
  }

  /**
   * إلغاء وثيقة مُصدَرة (نسبةً وتناسبًا): يحسب القسط المُرتجَع من الأيام غير المنقضية،
   * وينشئ ملحق إلغاء + إشعارًا دائنًا (CNP) للعميل + قيدًا عكسيًا (JRV)، ويحوّل الوثيقة إلى CANCELLED.
   */
  async cancelPolicy(tenantId: string, userId: string, policyId: string, dto: { effectiveDate?: string; reason?: string }) {
    const policy = await this.prisma.policy.findFirst({ where: { id: policyId } });
    if (!policy) throw new NotFoundException("الوثيقة غير موجودة");
    if (policy.status !== "ISSUED") throw new ConflictException("لا يُلغى إلا وثيقة مُصدَرة");
    if (!policy.startDate || !policy.endDate) throw new ConflictException("الوثيقة تفتقر لتواريخ التغطية لحساب المُرتجَع");
    const DAY = 86_400_000;
    const eff = dto.effectiveDate ? new Date(dto.effectiveDate) : new Date();
    const totalDays = Math.max(1, Math.round((+policy.endDate - +policy.startDate) / DAY));
    const unexpired = Math.max(0, Math.min(totalDays, Math.round((+policy.endDate - +eff) / DAY)));
    const frac = unexpired / totalDays;
    const returnNet = r2(num(policy.premium) * frac);
    const returnVat = r2(num(policy.vat) * frac);
    const returnTotal = r2(returnNet + returnVat);
    const returnCommission = r2(num(policy.commissionAmount) * frac);
    const returnCommVat = r2(returnCommission * 0.15);
    const returnTrust = r2(returnTotal - returnCommission - returnCommVat);

    const creditSeq = await this.seq.nextNoteSeq("CN");
    // إشعار دائن على المؤمِّن (CNC) لعكس العمولة المستردّة — رقمه يلي إشعار العميل الدائن
    const creditInsurerSeq = returnCommission > 0 ? creditSeq.replace(/^CN/, "CNC").replace(/(\d+)$/, (m) => String(Number(m) + 1)) : null;
    const voucherSeq = await this.seq.nextVoucherSeq("JRV");
    const endoCount = await this.prisma.endorsement.count({ where: { policyId } });

    const result = await this.prisma.$transaction(async (tx) => {
      const endo = await tx.endorsement.create({ data: { tenantId, policyId, sequenceNo: `${policy.sequenceNo ?? policyId}/E${endoCount + 1}`, type: "cancellation", effectiveDate: eff, premiumDelta: r2(-returnNet), details: asJson({ reason: dto.reason ?? null, returnPremium: returnNet, unexpiredDays: unexpired, totalDays }), status: "ISSUED" } });
      const creditNote = await tx.creditNote.create({ data: { tenantId, sequenceNo: creditSeq, kind: "CNP", clientId: policy.clientId, policyId, netAmount: returnNet, vatAmount: returnVat } });
      // إشعار دائن للمؤمِّن يعكس العمولة (وضريبتها) المستردّة نسبةً وتناسبًا — مقابل الفاتورة الضريبية الأصلية
      const creditInsurer = creditInsurerSeq ? await tx.creditNote.create({ data: { tenantId, sequenceNo: creditInsurerSeq, kind: "CNC", insurerName: policy.insurerName, policyId, netAmount: returnCommission, vatAmount: returnCommVat } }) : null;
      const voucher = await tx.voucher.create({ data: { tenantId, type: "JRV", sequenceNo: voucherSeq, amount: returnTotal, status: "posted", isAuto: true, reference: policyId, lines: asJson({
        description: `إلغاء الوثيقة ${policy.sequenceNo} — قسط مُرتجَع (${unexpired}/${totalDays} يوم)`,
        entries: [
          { account: "01030000000000000", name: "ذمم العملاء المدينة", debit: 0, credit: returnTotal },
          { account: "02020000000000000", name: "أمانات أقساط العملاء (Off-Balance)", debit: returnTrust, credit: 0 },
          { account: "04010000000000000", name: "عمولات الوساطة", debit: returnCommission, credit: 0 },
          { account: "02030000000000000", name: "ضريبة القيمة المضافة المستحقة (Output VAT)", debit: returnCommVat, credit: 0 },
        ],
      }) } });
      const updated = await tx.policy.update({ where: { id: policyId }, data: { status: "CANCELLED" }, select: { id: true, sequenceNo: true, status: true } });
      return { endo, creditNote, creditInsurer, voucher, policy: updated };
    });
    await this.audit.log({ tenantId, userId, action: "update", entity: "policy_cancellation", entityId: policyId, meta: { creditNote: creditSeq, creditInsurer: result.creditInsurer?.sequenceNo ?? null, returnPremium: returnNet, returnCommission, unexpiredDays: unexpired, totalDays } });
    return { status: "CANCELLED", creditNote: result.creditNote.sequenceNo, creditNoteInsurer: result.creditInsurer?.sequenceNo ?? null, endorsement: result.endo.sequenceNo, returnNet, returnVat, returnTotal, returnCommission, returnCommVat, unexpiredDays: unexpired, totalDays };
  }

  /**
   * المستحقّ للمؤمِّنين (صافي القسط المحتفَظ به أمانةً) لكل مؤمِّن — مع أعمار الدَّين والمُسوّى.
   * الأمانة للمؤمِّن = إجمالي القسط − عمولة الوسيط − ضريبة العمولة (تُحتَجز للوسيط).
   */
  async payables() {
    const DAY = 86_400_000;
    const [policies, settlements] = await Promise.all([
      this.prisma.policy.findMany({ where: { status: "ISSUED" }, select: { insurerName: true, totalPremium: true, commissionAmount: true, issueDate: true, createdAt: true } }),
      this.prisma.voucher.findMany({ where: { type: "PYV" }, select: { amount: true, reference: true } }),
    ]);
    const settledBy = new Map<string, number>();
    for (const s of settlements) { const k = s.reference ?? "—"; settledBy.set(k, r2((settledBy.get(k) ?? 0) + num(s.amount))); }
    const now = Date.now();
    const byInsurer = new Map<string, { insurer: string; payable: number; count: number; b: [number, number, number, number] }>();
    for (const p of policies) {
      const key = p.insurerName ?? "—";
      const trust = r2(num(p.totalPremium) - num(p.commissionAmount) * 1.15); // أمانة المؤمِّن
      const days = (now - +(p.issueDate ?? p.createdAt)) / DAY;
      const i = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
      const g = byInsurer.get(key) ?? { insurer: key, payable: 0, count: 0, b: [0, 0, 0, 0] };
      g.payable = r2(g.payable + trust); g.count += 1; g.b[i] = r2(g.b[i] + trust);
      byInsurer.set(key, g);
    }
    const rows = [...byInsurer.values()].map((g) => {
      const settled = settledBy.get(g.insurer) ?? 0;
      return { ...g, settled: r2(settled), outstanding: r2(Math.max(0, g.payable - settled)) };
    }).sort((a, b) => b.outstanding - a.outstanding);
    const totalPayable = r2(rows.reduce((s, r) => s + r.payable, 0));
    const totalSettled = r2(rows.reduce((s, r) => s + r.settled, 0));
    return { rows, summary: { payable: totalPayable, settled: totalSettled, outstanding: r2(Math.max(0, totalPayable - totalSettled)) } };
  }

  /** سند صرف (PYV) لتسوية مستحقّ مؤمِّن — يمنع تجاوز المستحقّ. */
  async settleInsurer(tenantId: string, userId: string, dto: { insurerName: string; amount: number; reference?: string; paidDate?: string }) {
    const { rows } = await this.payables();
    const row = rows.find((r) => r.insurer === dto.insurerName);
    if (!row) throw new NotFoundException("لا يوجد مستحقّ لهذا المؤمِّن");
    if (dto.amount > row.outstanding + 0.001) throw new ConflictException(`المبلغ يتجاوز المتبقّي المستحقّ (${row.outstanding})`);
    const seq = await this.seq.nextVoucherSeq("PYV");
    const voucher = await this.prisma.voucher.create({
      data: {
        tenantId, type: "PYV", sequenceNo: seq, amount: r2(dto.amount), status: "posted", isAuto: false, reference: dto.insurerName,
        lines: asJson({
          description: `تسوية مستحقّ ${dto.insurerName}`, ref: dto.reference ?? null, paidDate: dto.paidDate ?? null, insurer: dto.insurerName,
          entries: [
            { account: "02020000000000000", name: "أمانات أقساط العملاء (Off-Balance)", debit: r2(dto.amount), credit: 0 },
            { account: "01010000000000000", name: "النقد والبنوك", debit: 0, credit: r2(dto.amount) },
          ],
        }),
      },
      select: { id: true, sequenceNo: true, amount: true },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "insurer_settlement", entityId: voucher.id, meta: { insurer: dto.insurerName, amount: r2(dto.amount) } });
    const settled = r2(row.settled + dto.amount);
    return { voucher, insurer: dto.insurerName, payable: row.payable, settled, outstanding: r2(Math.max(0, row.payable - settled)) };
  }

  /** ميزان المراجعة: تجميع كل أطراف قيود السندات حسب الحساب (مدين/دائن/الرصيد). */
  async trialBalance() {
    const vouchers = await this.prisma.voucher.findMany({ select: { lines: true } });
    const acc = new Map<string, { account: string; name: string; debit: number; credit: number }>();
    for (const v of vouchers) {
      const entries = ((v.lines as { entries?: Array<{ account?: string; name?: string; debit?: number; credit?: number }> } | null)?.entries) ?? [];
      for (const e of entries) {
        const key = e.account ?? "—";
        const g = acc.get(key) ?? { account: key, name: e.name ?? "—", debit: 0, credit: 0 };
        g.debit = r2(g.debit + num(e.debit)); g.credit = r2(g.credit + num(e.credit));
        if (e.name) g.name = e.name;
        acc.set(key, g);
      }
    }
    const rows = [...acc.values()].map((g) => ({ ...g, balance: r2(g.debit - g.credit) })).sort((a, b) => a.account.localeCompare(b.account));
    const totalDebit = r2(rows.reduce((s, r) => s + r.debit, 0));
    const totalCredit = r2(rows.reduce((s, r) => s + r.credit, 0));
    return { rows, totals: { debit: totalDebit, credit: totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 } };
  }

  /** ملخّص مالي: القسط المكتتب، العمولة، الأمانات (خارج الميزانية)، الذمم. */
  async summary() {
    const [policyAgg, commissionAgg, invoiceAgg, debitAgg, creditAgg, vouchers] = await Promise.all([
      this.prisma.policy.aggregate({ where: { status: "ISSUED" }, _sum: { premium: true, vat: true, totalPremium: true, commissionAmount: true, policyFees: true } }),
      this.prisma.commission.aggregate({ _sum: { amount: true } }),
      this.prisma.invoice.aggregate({ _sum: { totalAmount: true }, _count: true }),
      this.prisma.debitNote.aggregate({ _sum: { netAmount: true, vatAmount: true, settledAmount: true } }),
      this.prisma.creditNote.aggregate({ where: { clientId: { not: null } }, _sum: { netAmount: true, vatAmount: true } }), // على العملاء فقط
      this.prisma.voucher.count(),
    ]);
    const total = num(policyAgg._sum.totalPremium);
    const commission = num(policyAgg._sum.commissionAmount);
    const serviceFees = num(policyAgg._sum.policyFees); // رسوم الخدمة/الإصدار (إيراد الوسيط الخاص)
    const commissionVat = r2(commission * 0.15);
    const outputVatPayable = r2(commissionVat + serviceFees * 0.15); // ضريبة مخرجات الوسيط: عمولات + رسوم خدمة (تُورَّد لـ ZATCA)
    const creditsTotal = r2(num(creditAgg._sum.netAmount) + num(creditAgg._sum.vatAmount)); // إشعارات دائنة (قسط مُرتجَع للعملاء)
    return {
      grossPremium: total,
      netPremium: num(policyAgg._sum.premium),
      vat: num(policyAgg._sum.vat),
      commission: num(commissionAgg._sum.amount),
      serviceFees, // رسوم الخدمة/الإصدار المُفوترة على العملاء
      outputVatPayable, // ضريبة القيمة المضافة المستحقة (عمولات + رسوم)
      offBalanceTrust: r2(total - commission - commissionVat), // أمانات أقساط العملاء (خارج الميزانية) — الرسوم ليست أمانة
      receivables: r2(num(debitAgg._sum.netAmount) + num(debitAgg._sum.vatAmount) - num(debitAgg._sum.settledAmount) - creditsTotal), // المتبقّي بعد التحصيل والإشعارات الدائنة
      collected: r2(num(debitAgg._sum.settledAmount)), // المُحصَّل من العملاء
      creditNotes: creditsTotal, // إجمالي الإشعارات الدائنة (قسط مُرتجَع)
      invoiceCount: invoiceAgg._count,
      voucherCount: vouchers,
    };
  }

  /**
   * نظرة المالك المالية: قائمة دخل مبسّطة (أساس الاستحقاق) + مؤشّرات صحة الأعمال + اتجاه 6 أشهر.
   * دخل الوساطة = عمولات (من المؤمِّنين) + رسوم خدمة (على العملاء) − عمولات الوسطاء الفرعيين.
   * ملاحظة: ضريبة القيمة المضافة **ليست** إيرادًا/مصروفًا (تمرّ للهيئة) فتُستبعد من القائمة.
   */
  async overview() {
    const now = new Date();
    // بداية الشهر قبل 5 أشهر (نافذة 6 أشهر شاملة الحالي)
    const windowStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [agg, policyCount, commRows, claimsAgg, debitAgg, creditAgg, trendRows] = await Promise.all([
      this.prisma.policy.aggregate({ where: { status: "ISSUED" }, _sum: { premium: true, totalPremium: true, commissionAmount: true, policyFees: true, producerCommission: true } }),
      this.prisma.policy.count({ where: { status: "ISSUED" } }),
      this.prisma.commission.groupBy({ by: ["status"], _sum: { amount: true, receivedAmount: true } }),
      this.prisma.claim.aggregate({ _sum: { settledAmount: true } }),
      this.prisma.debitNote.aggregate({ _sum: { netAmount: true, vatAmount: true, settledAmount: true } }),
      this.prisma.creditNote.aggregate({ where: { clientId: { not: null } }, _sum: { netAmount: true, vatAmount: true } }),
      this.prisma.policy.findMany({
        where: { status: "ISSUED", issueDate: { gte: windowStart } },
        select: { issueDate: true, createdAt: true, commissionAmount: true, policyFees: true, producerCommission: true },
      }),
    ]);

    // ——— قائمة الدخل (أساس الاستحقاق: يُكتسب عند الإصدار) ———
    const commissionIncome = r2(num(agg._sum.commissionAmount));
    const serviceFees = r2(num(agg._sum.policyFees));
    const subBrokerCommission = r2(num(agg._sum.producerCommission)); // مصروف مباشر (عمولات الوسطاء الفرعيين)
    const totalRevenue = r2(commissionIncome + serviceFees);
    const netIncome = r2(totalRevenue - subBrokerCommission);
    const netMargin = totalRevenue > 0 ? Math.round((netIncome / totalRevenue) * 1000) / 10 : 0;

    // ——— مؤشّرات صحة الأعمال ———
    const gwp = r2(num(agg._sum.totalPremium)); // إجمالي القسط المُدار (تدفّق، ليس إيرادًا)
    const netPremium = num(agg._sum.premium);
    const effectiveCommissionRate = netPremium > 0 ? Math.round((commissionIncome / netPremium) * 1000) / 10 : 0;
    const avgIncomePerPolicy = policyCount > 0 ? r2(netIncome / policyCount) : 0;
    const settledClaims = r2(num(claimsAgg._sum.settledAmount));
    const lossRatio = netPremium > 0 ? Math.round((settledClaims / netPremium) * 1000) / 10 : 0;

    // تحصيل العمولات من المؤمِّنين (نقدي): المُستلَم مقابل الإجمالي
    const commissionTotal = r2(commRows.reduce((s, r) => s + num(r._sum.amount), 0));
    const commissionReceived = r2(commRows.reduce((s, r) => s + num(r._sum.receivedAmount), 0));
    const commissionCollectedPct = commissionTotal > 0 ? Math.round((commissionReceived / commissionTotal) * 100) : 0;

    // الذمم على العملاء + أمانات الأقساط (خارج الميزانية)
    const creditsTotal = r2(num(creditAgg._sum.netAmount) + num(creditAgg._sum.vatAmount));
    const receivables = r2(num(debitAgg._sum.netAmount) + num(debitAgg._sum.vatAmount) - num(debitAgg._sum.settledAmount) - creditsTotal);
    const trustToRemit = r2(num(agg._sum.totalPremium) - commissionIncome - commissionIncome * 0.15); // أمانات المؤمِّنين

    // ——— اتجاه صافي الدخل لآخر 6 أشهر ———
    const buckets = new Map<string, { revenue: number; expense: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, { revenue: 0, expense: 0 });
    }
    for (const p of trendRows) {
      const d = p.issueDate ?? p.createdAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const b = buckets.get(key);
      if (!b) continue;
      b.revenue += num(p.commissionAmount) + num(p.policyFees);
      b.expense += num(p.producerCommission);
    }
    const trend = Array.from(buckets.entries()).map(([month, b]) => ({ month, revenue: r2(b.revenue), expense: r2(b.expense), net: r2(b.revenue - b.expense) }));

    return {
      incomeStatement: { commissionIncome, serviceFees, totalRevenue, subBrokerCommission, netIncome, netMargin },
      health: {
        gwp,
        policyCount,
        effectiveCommissionRate,
        avgIncomePerPolicy,
        commissionCollectedPct,
        commissionReceived,
        commissionOutstanding: r2(commissionTotal - commissionReceived),
        receivables,
        trustToRemit,
        lossRatio,
        settledClaims,
      },
      trend,
    };
  }

  async postings(policyId: string) {
    const [voucher, debitNote, invoices, creditNotes] = await Promise.all([
      this.prisma.voucher.findFirst({ where: { reference: policyId } }),
      this.prisma.debitNote.findFirst({ where: { policyId } }),
      this.prisma.invoice.findMany({ where: { policyId }, orderBy: { createdAt: "asc" } }),
      this.prisma.creditNote.findMany({ where: { policyId }, orderBy: { createdAt: "asc" } }),
    ]);
    const invoice = invoices.find((i) => (i.kind ?? "COMMISSION") === "COMMISSION") ?? invoices[0] ?? null; // توافق خلفي
    return { voucher, debitNote, invoice, invoices, creditNotes };
  }

  async approvePolicy(tenantId: string, userId: string, policyId: string) {
    const policy = await this.prisma.policy.findFirst({ where: { id: policyId } });
    if (!policy) throw new NotFoundException("الوثيقة غير موجودة");
    if (policy.status !== "FINANCE_REVIEW") {
      throw new ConflictException("الوثيقة ليست بانتظار الاعتماد المالي (يلزم الموافقة الفنية أولاً)");
    }
    // E2 — الاعتماد المالي هو الخطوة الأخيرة: محجوب حتى تُستوفى خطوات الاعتماد الإضافية المُهيّأة
    if (policy.pendingApprovals.length > 0) {
      throw new ConflictException(`الوثيقة بانتظار موافقات إضافية قبل الاعتماد المالي (${policy.pendingApprovals.length} متبقّية)`);
    }
    // حارس امتثالي — فصل المهام: المعتمِد المالي ≠ مُصدِر الوثيقة (هيئة التأمين/NCA ECC). مُفعَّل افتراضيًا.
    const approvalCfg = await this.config.getPolicyApprovalConfig(tenantId);
    if (approvalCfg.segregationOfDuties) {
      const issued = await this.prisma.auditLog.findFirst({ where: { entity: "policy", entityId: policyId, action: "create" }, orderBy: { createdAt: "asc" }, select: { userId: true } });
      if (issued?.userId && issued.userId === userId) {
        throw new ForbiddenException("فصل المهام: لا يجوز أن يعتمد مُصدِر الوثيقة نفسه ماليًا (متطلّب رقابي)");
      }
    }

    // E1 — الضريبة حسب فرع التأمين: قسط تأمين الحياة معفى (فئة "E"، 0%)؛ البقية قياسية 15% (فئة "S")
    const line = policy.productLineCode
      ? await this.prisma.productLine.findFirst({ where: { code: policy.productLineCode }, include: { class: true } })
      : null;
    const treatment = vatTreatmentForClass(line?.class.code);
    const premium = Number(policy.premium ?? 0);
    const vat = treatment.rate === 0 ? 0 : Number(policy.vat ?? 0);
    const total = r2(premium + vat);
    const commission = Number(policy.commissionAmount ?? 0);
    const commVat = r2(commission * 0.15); // ضريبة القيمة المضافة على عمولة الوساطة (مخرجات الوسيط)
    // الوسيط يحتفظ بعمولته + ضريبتها، ويحوّل الباقي (القسط + ضريبته − العمولة − ضريبتها) أمانةً للمؤمِّن.
    const trust = r2(total - commission - commVat); // أمانات أقساط العملاء (خارج الميزانية)
    // رسوم الخدمة/الإصدار = إيراد الوسيط الخاص (خدمة خاضعة دائماً للضريبة القياسية 15%، فئة "S")، مستقلّة عن أمانة القسط.
    const fees = r2(Number(policy.policyFees ?? 0));
    const feesVat = r2(fees * 0.15);
    const feesTotal = r2(fees + feesVat);

    const voucherSeq = await this.seq.nextVoucherSeq("JRV");
    const debitSeq = await this.seq.nextNoteSeq("DN");
    const invoiceSeq = await this.seq.nextInvoiceSeq();
    // فاتورة الرسوم رقمها يلي فاتورة العمولة (كلاهما يُنشأ في المعاملة نفسها قبل تحديث العدّاد)
    const feesInvoiceSeq = fees > 0 ? invoiceSeq.replace(/(\d+)$/, (m) => String(Number(m) + 1)) : null;

    // بيانات العميل + وجود تهيئة ZATCA (لتوليد مستندات الفوترة المتوافقة)
    const client = policy.clientId
      ? await this.prisma.client.findFirst({ where: { id: policy.clientId }, select: { name: true, type: true, crNumber: true, nationalId: true, city: true } })
      : null;
    const hasZatca = await this.prisma.tenantZatcaConfig.findFirst({ where: { tenantId }, select: { id: true } });
    const supplyDate = policy.startDate ? policy.startDate.toISOString().slice(0, 10) : null;

    const result = await this.prisma.$transaction(async (tx) => {
      // 1) قيد يومية (JRV) — مدين = دائن. الرسوم إيراد للوسيط (04020) + ضريبتها، والعميل مدين بها.
      const jrvEntries = [
        { account: "01030000000000000", name: "ذمم العملاء المدينة", debit: r2(total + feesTotal), credit: 0 },
        { account: "02020000000000000", name: "أمانات أقساط العملاء (Off-Balance)", debit: 0, credit: trust },
        { account: "04010000000000000", name: "عمولات الوساطة", debit: 0, credit: commission },
        { account: "02030000000000000", name: "ضريبة القيمة المضافة المستحقة (Output VAT)", debit: 0, credit: r2(commVat + feesVat) },
      ];
      if (fees > 0) jrvEntries.push({ account: "04020000000000000", name: "رسوم خدمات وإصدار الوثائق", debit: 0, credit: fees });
      const voucher = await tx.voucher.create({
        data: {
          tenantId,
          type: "JRV",
          sequenceNo: voucherSeq,
          amount: r2(total + feesTotal),
          status: "posted",
          isAuto: true,
          reference: policy.id,
          lines: asJson({ description: `إصدار الوثيقة ${policy.sequenceNo}`, entries: jrvEntries }),
        },
      });

      // 2) إشعار مدين للعميل (قسط + ضريبته + رسوم الخدمة + ضريبتها) — مطالبة واحدة قابلة للتحصيل
      const debitNote = await tx.debitNote.create({
        data: { tenantId, sequenceNo: debitSeq, clientId: policy.clientId, policyId: policy.id, netAmount: r2(premium + fees), vatAmount: r2(vat + feesVat) },
      });

      // 3) فاتورة ضريبية لشركة التأمين (العمولة + ضريبتها)
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          sequenceNo: invoiceSeq,
          kind: "COMMISSION",
          insurerName: policy.insurerName,
          policyId: policy.id,
          netAmount: commission,
          vatAmount: commVat,
          totalAmount: r2(commission + commVat),
          status: "issued",
        },
      });

      // 3ب) فاتورة ضريبية للعميل برسوم الخدمة/الإصدار (إيراد الوسيط الخاص) — منفصلة عن أمانة القسط
      const feesInvoice = fees > 0 ? await tx.invoice.create({
        data: {
          tenantId,
          sequenceNo: feesInvoiceSeq,
          kind: "FEES",
          clientId: policy.clientId,
          policyId: policy.id,
          netAmount: fees,
          vatAmount: feesVat,
          totalAmount: feesTotal,
          status: "issued",
        },
      }) : null;

      // 4) فتح حساب تحليلي للعميل في COA (مستوى 3 تحت ذمم العملاء 0103) إن لم يوجد
      if (policy.clientId) {
        const existing = await tx.chartOfAccount.findFirst({ where: { clientId: policy.clientId } });
        if (!existing) {
          const parentId = `coa-${tenantId}-01030000000000000`;
          const count = await tx.chartOfAccount.count({ where: { level: 3, parentId } });
          const code = "0103" + String(1001 + count).padStart(13, "0"); // 17 رقماً تحت 0103
          await tx.chartOfAccount.create({
            data: {
              tenantId,
              code,
              name: `حساب العميل ${policy.clientId}`,
              level: 3,
              parentId,
              isOnBalance: true,
              isLocked: false,
              accountType: "asset",
              clientId: policy.clientId,
            },
          });
        }
      }

      // 5) مستندات ZATCA المتوافقة (داخل المعاملة — عدّاد/تجزئة/UUID معزولة بالمستأجر)
      const billing: string[] = [];
      if (hasZatca) {
        const subtype = client?.type === "INDIVIDUAL" ? ("SIMPLIFIED_B2C" as const) : ("STANDARD_B2B" as const);
        const dnLines = [{ description: policy.productLineCode ?? "قسط تأمين", quantity: 1, unitPrice: premium, vatRate: treatment.rate, vatAmount: vat, net: premium, taxCategory: treatment.category, exemptionReasonCode: treatment.exemptionReasonCode, exemptionReason: treatment.exemptionReason }];
        // رسوم الخدمة/الإصدار سطر مستقل خاضع للضريبة القياسية 15% (فئة "S") — مستند العميل يطابق إشعار المدين
        if (fees > 0) dnLines.push({ description: "رسوم خدمة وإصدار", quantity: 1, unitPrice: fees, vatRate: 15, vatAmount: feesVat, net: fees, taxCategory: "S", exemptionReasonCode: undefined, exemptionReason: undefined });
        const dn = await this.zatcaBilling.createInTx(tx, tenantId, {
          documentType: "DEBIT_NOTE", subtype, clientId: policy.clientId, policyId: policy.id,
          customer: { name: client?.name, crOrId: client?.crNumber ?? client?.nationalId, address: client?.city },
          lines: dnLines,
          supplyDate,
        });
        const inv = await this.zatcaBilling.createInTx(tx, tenantId, {
          documentType: "TAX_INVOICE", subtype: "STANDARD_B2B", clientId: policy.clientId, policyId: policy.id,
          customer: { name: policy.insurerName },
          // عمولة الوساطة رسم خدمة خاضع دائماً للضريبة القياسية 15% (فئة "S") بصرف النظر عن فرع الوثيقة
          lines: [{ description: "عمولة وساطة", quantity: 1, unitPrice: commission, vatRate: 15, vatAmount: commVat, net: commission, taxCategory: "S" }],
          supplyDate,
        });
        billing.push(dn.id, inv.id);
      }

      // 6) تحديث الحالات ⇒ الوثيقة والطلب ISSUED
      await tx.policy.update({ where: { id: policyId }, data: { status: "ISSUED" } });
      if (policy.requestId) await tx.policyRequest.update({ where: { id: policy.requestId }, data: { status: "ISSUED" } });

      return { voucher: voucher.sequenceNo, debitNote: debitNote.sequenceNo, invoice: invoice.sequenceNo, feesInvoice: feesInvoice?.sequenceNo ?? null, billing };
    });

    await this.audit.log({ tenantId, userId, action: "approve", entity: "policy_finance", entityId: policyId, meta: { voucher: result.voucher, debitNote: result.debitNote, invoice: result.invoice, feesInvoice: result.feesInvoice } });

    // توجيه مستندات ZATCA بعد تثبيت المعاملة (مقاصة B2B فوراً / إبلاغ B2C خلفياً)
    for (const docId of result.billing) {
      await this.zatcaRouter.route(docId).catch((e) => this.logger.warn(`ZATCA routing failed for ${docId}: ${e?.message}`));
    }

    // إشعار العميل بإصدار إشعار المدين (لا يُفشل الاعتماد المالي عند تعذّره)
    if (policy.clientId) {
      const contact = await this.prisma.client.findFirst({ where: { id: policy.clientId }, select: { email: true, phone: true } });
      if (contact) void this.notifications.notify(tenantId, "debit_note", { email: contact.email ?? undefined, phone: contact.phone ?? undefined, clientId: policy.clientId }, { ref: String(result.debitNote) }).catch(() => undefined);
    }
    // إشعار داخلي باكتمال إصدار الوثيقة
    void this.notifications.notifyStaff(tenantId, "staff_policy_issued", { sequenceNo: policy.sequenceNo ?? policyId }).catch(() => undefined);

    return { policyId, status: "ISSUED", voucher: result.voucher, debitNote: result.debitNote, invoice: result.invoice, feesInvoice: result.feesInvoice, serviceFees: fees, billingDocuments: result.billing.length };
  }
}
