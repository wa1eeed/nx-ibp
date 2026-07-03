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
      select: { id: true, sequenceNo: true, insurerName: true, netAmount: true, vatAmount: true, totalAmount: true, status: true, createdAt: true },
    });
    return rows.map((inv) => ({
      ...inv,
      zatca: zatcaPackage({
        sellerName,
        vatNumber,
        timestamp: new Date(inv.createdAt).toISOString(),
        total: num(inv.totalAmount),
        vat: num(inv.vatAmount),
      }),
    }));
  }

  /** الذمم المدينة (المستحقّ على العملاء) من إشعارات المدين، مُجمّعة حسب العميل. */
  async receivables() {
    const notes = await this.prisma.debitNote.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, sequenceNo: true, clientId: true, policyId: true, netAmount: true, vatAmount: true, createdAt: true },
    });
    const clientIds = [...new Set(notes.map((n) => n.clientId).filter((x): x is string => !!x))];
    const clients = clientIds.length
      ? await this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
      : [];
    const nameOf = Object.fromEntries(clients.map((c) => [c.id, c.name]));

    const byClient = new Map<string, { clientId: string; clientName: string; total: number; count: number }>();
    let outstanding = 0;
    for (const n of notes) {
      const t = num(n.netAmount) + num(n.vatAmount);
      outstanding += t;
      const key = n.clientId ?? "—";
      const cur = byClient.get(key) ?? { clientId: key, clientName: nameOf[key] ?? "—", total: 0, count: 0 };
      cur.total += t;
      cur.count += 1;
      byClient.set(key, cur);
    }
    return {
      outstanding: r2(outstanding),
      byClient: [...byClient.values()].sort((a, b) => b.total - a.total),
      notes: notes.map((n) => ({ id: n.id, sequenceNo: n.sequenceNo, clientName: nameOf[n.clientId ?? ""] ?? "—", total: r2(num(n.netAmount) + num(n.vatAmount)), createdAt: n.createdAt })),
    };
  }

  /** ملخّص مالي: القسط المكتتب، العمولة، الأمانات (خارج الميزانية)، الذمم. */
  async summary() {
    const [policyAgg, commissionAgg, invoiceAgg, debitAgg, vouchers] = await Promise.all([
      this.prisma.policy.aggregate({ where: { status: "ISSUED" }, _sum: { premium: true, vat: true, totalPremium: true, commissionAmount: true } }),
      this.prisma.commission.aggregate({ _sum: { amount: true } }),
      this.prisma.invoice.aggregate({ _sum: { totalAmount: true }, _count: true }),
      this.prisma.debitNote.aggregate({ _sum: { netAmount: true, vatAmount: true } }),
      this.prisma.voucher.count(),
    ]);
    const total = num(policyAgg._sum.totalPremium);
    const commission = num(policyAgg._sum.commissionAmount);
    const outputVatPayable = r2(commission * 0.15); // ضريبة مخرجات الوسيط على العمولات (تُورَّد لـ ZATCA)
    return {
      grossPremium: total,
      netPremium: num(policyAgg._sum.premium),
      vat: num(policyAgg._sum.vat),
      commission: num(commissionAgg._sum.amount),
      outputVatPayable, // ضريبة القيمة المضافة المستحقة على العمولة
      offBalanceTrust: r2(total - commission - outputVatPayable), // أمانات أقساط العملاء (خارج الميزانية)
      receivables: r2(num(debitAgg._sum.netAmount) + num(debitAgg._sum.vatAmount)),
      invoiceCount: invoiceAgg._count,
      voucherCount: vouchers,
    };
  }

  async postings(policyId: string) {
    const [voucher, debitNote, invoice] = await Promise.all([
      this.prisma.voucher.findFirst({ where: { reference: policyId } }),
      this.prisma.debitNote.findFirst({ where: { policyId } }),
      this.prisma.invoice.findFirst({ where: { policyId } }),
    ]);
    return { voucher, debitNote, invoice };
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

    const voucherSeq = await this.seq.nextVoucherSeq("JRV");
    const debitSeq = await this.seq.nextNoteSeq("DN");
    const invoiceSeq = await this.seq.nextInvoiceSeq();

    // بيانات العميل + وجود تهيئة ZATCA (لتوليد مستندات الفوترة المتوافقة)
    const client = policy.clientId
      ? await this.prisma.client.findFirst({ where: { id: policy.clientId }, select: { name: true, type: true, crNumber: true, nationalId: true, city: true } })
      : null;
    const hasZatca = await this.prisma.tenantZatcaConfig.findFirst({ where: { tenantId }, select: { id: true } });
    const supplyDate = policy.startDate ? policy.startDate.toISOString().slice(0, 10) : null;

    const result = await this.prisma.$transaction(async (tx) => {
      // 1) قيد يومية (JRV) — مدين = دائن
      const voucher = await tx.voucher.create({
        data: {
          tenantId,
          type: "JRV",
          sequenceNo: voucherSeq,
          amount: total,
          status: "posted",
          isAuto: true,
          reference: policy.id,
          lines: asJson({
            description: `إصدار الوثيقة ${policy.sequenceNo}`,
            entries: [
              { account: "01030000000000000", name: "ذمم العملاء المدينة", debit: total, credit: 0 },
              { account: "02020000000000000", name: "أمانات أقساط العملاء (Off-Balance)", debit: 0, credit: trust },
              { account: "04010000000000000", name: "عمولات الوساطة", debit: 0, credit: commission },
              { account: "02030000000000000", name: "ضريبة القيمة المضافة المستحقة (Output VAT)", debit: 0, credit: commVat },
            ],
          }),
        },
      });

      // 2) إشعار مدين للعميل (قسط + ضريبة)
      const debitNote = await tx.debitNote.create({
        data: { tenantId, sequenceNo: debitSeq, clientId: policy.clientId, policyId: policy.id, netAmount: premium, vatAmount: vat },
      });

      // 3) فاتورة ضريبية لشركة التأمين (العمولة + ضريبتها)
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          sequenceNo: invoiceSeq,
          insurerName: policy.insurerName,
          policyId: policy.id,
          netAmount: commission,
          vatAmount: commVat,
          totalAmount: r2(commission + commVat),
          status: "issued",
        },
      });

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
        const dn = await this.zatcaBilling.createInTx(tx, tenantId, {
          documentType: "DEBIT_NOTE", subtype, clientId: policy.clientId, policyId: policy.id,
          customer: { name: client?.name, crOrId: client?.crNumber ?? client?.nationalId, address: client?.city },
          lines: [{ description: policy.productLineCode ?? "قسط تأمين", quantity: 1, unitPrice: premium, vatRate: treatment.rate, vatAmount: vat, net: premium, taxCategory: treatment.category, exemptionReasonCode: treatment.exemptionReasonCode, exemptionReason: treatment.exemptionReason }],
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

      return { voucher: voucher.sequenceNo, debitNote: debitNote.sequenceNo, invoice: invoice.sequenceNo, billing };
    });

    await this.audit.log({ tenantId, userId, action: "approve", entity: "policy_finance", entityId: policyId, meta: { voucher: result.voucher, debitNote: result.debitNote, invoice: result.invoice } });

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

    return { policyId, status: "ISSUED", voucher: result.voucher, debitNote: result.debitNote, invoice: result.invoice, billingDocuments: result.billing.length };
  }
}
