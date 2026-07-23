import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { TenantEmailService } from "../email/tenant-email.service";
import { vatTreatmentForClass } from "../../common/tax/vat";
import type { CreateSlipDto } from "./dto/create-slip.dto";
import type { CreateQuotationDto } from "./dto/create-quotation.dto";

const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));
const asJson = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * الاكتتاب الفني (المرحلة 4أ): طلب الأسعار (Slip/RFQ)، عروض شركات التأمين الهجينة،
 * جدول المقارنة الآلي، وأمر الإسناد (Firm Order). محكوم ببوّابة الالتزام.
 */
@Injectable()
export class SlipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly email: TenantEmailService,
  ) {}

  listSlips() {
    return this.prisma.slip.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sequenceNo: true,
        status: true,
        tenantId: true,
        createdAt: true,
        presentedAt: true,
        clientDecision: true,
        request: { select: { id: true, productLineCode: true, client: { select: { id: true, name: true } } } },
        _count: { select: { quotations: true } },
      },
    });
  }

  async getSlip(id: string) {
    const slip = await this.prisma.slip.findFirst({
      where: { id },
      select: {
        id: true,
        sequenceNo: true,
        status: true,
        insurers: true,
        notes: true,
        selectedQuotationId: true,
        presentedAt: true,
        presentedQuotationIds: true,
        clientDecision: true,
        clientDecidedAt: true,
        acceptedQuotationId: true,
        clientDecisionNote: true,
        tenantId: true,
        request: { select: { id: true, productLineCode: true, client: { select: { id: true, name: true } } } },
        quotations: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!slip) throw new NotFoundException("طلب الأسعار غير موجود");

    // المعالجة الضريبية للقسط بحسب فئة المنتج (الحياة معفاة 0%؛ البقية 15%) —
    // تُمرَّر للواجهة كي تُحتسب الضريبة تلقائيًا بالنسبة الصحيحة (لا إدخال يدوي).
    let vatRate = 15;
    if (slip.request?.productLineCode) {
      const line = await this.prisma.productLine.findFirst({
        where: { code: slip.request.productLineCode },
        select: { class: { select: { code: true } } },
      });
      vatRate = vatTreatmentForClass(line?.class?.code).rate;
    }
    return { ...slip, vatRate };
  }

  async createSlip(tenantId: string, userId: string, dto: CreateSlipDto) {
    const request = await this.prisma.policyRequest.findFirst({
      where: { id: dto.requestId },
      include: { client: true },
    });
    if (!request) throw new NotFoundException("الطلب غير موجود");

    // حوكمة: لا طلب أسعار قبل اعتماد العميل من الالتزام
    if (request.client.complianceStatus !== "APPROVED") {
      throw new ConflictException("لا يمكن إعداد طلب أسعار: العميل غير معتمد من الالتزام");
    }

    const line = await this.prisma.productLine.findFirst({
      where: { code: request.productLineCode },
      include: { class: true },
    });
    const sequenceNo = await this.seq.nextSlipSeq(line?.class.code ?? "GEN");

    const slip = await this.prisma.$transaction(async (tx) => {
      const created = await tx.slip.create({
        data: {
          tenantId,
          requestId: request.id,
          sequenceNo,
          status: "SENT",
          insurers: dto.insurers ?? [],
          notes: dto.notes ?? null,
        },
        select: { id: true, sequenceNo: true, status: true, requestId: true, insurers: true, tenantId: true },
      });
      await tx.policyRequest.update({ where: { id: request.id }, data: { status: "QUOTING" } });
      return created;
    });

    await this.audit.log({ tenantId, userId, action: "create", entity: "slip", entityId: slip.id, meta: { requestId: request.id, sequenceNo } });
    return slip;
  }

  /**
   * الطبقة ١ — إرسال طلب العرض (RFQ) بالبريد لشركات التأمين المختارة من السجلّ.
   * يُرسَل من نطاق الوسيط (BYO Resend) مع Reply-To إيميله كي تصل ردود الشركات إليه.
   * الشركات بلا بريد مسجّل تُتخطّى وتُعاد في skipped. يُسجَّل مَن أُرسِل إليهم في slip.insurers + تدقيق.
   */
  /**
   * يبني سياق طلب العرض والصيغة الافتراضية المشتركة (موضوع + نصّ موحّد لكل الشركات المختارة).
   * النصّ لا يذكر اسم الشركة (البريد يصل إليها) فيصلح كصيغة واحدة قابلة للتعديل قبل الإرسال.
   */
  private async rfqContext(tenantId: string, slipId: string) {
    const slip = await this.prisma.slip.findFirst({
      where: { id: slipId },
      select: { id: true, sequenceNo: true, status: true, insurers: true, request: { select: { productLineCode: true, base: true, client: { select: { name: true } } } } },
    });
    if (!slip) throw new NotFoundException("طلب الأسعار غير موجود");
    const [line, tenant] = await Promise.all([
      this.prisma.productLine.findFirst({ where: { code: slip.request?.productLineCode ?? "" }, select: { name: true } }),
      this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { name: true } }),
    ]);
    const base = (slip.request?.base ?? {}) as { startDate?: string; endDate?: string; insuredName?: string };
    const clientName = slip.request?.client?.name ?? base.insuredName ?? "—";
    const lineName = line?.name ?? slip.request?.productLineCode ?? "—";
    const period = base.startDate && base.endDate ? `${base.startDate} — ${base.endDate}` : "—";
    const ref = slip.sequenceNo ?? slip.id;
    const subject = `طلب عرض سعر — ${clientName} — ${lineName} (${ref})`;
    const body = [
      `السلام عليكم ورحمة الله وبركاته،`,
      ``,
      `نأمل تزويدنا بعرض سعر للتغطية التالية:`,
      `• العميل: ${clientName}`,
      `• فرع التأمين: ${lineName}`,
      `• مدة التغطية: ${period}`,
      `• رقم المرجع: ${ref}`,
      ``,
      `نرجو موافاتنا بأفضل الشروط والأسعار في أقرب وقت ممكن. وللاستفسار يُرجى الرد على هذا البريد مباشرةً.`,
      ``,
      `مع خالص التقدير،`,
      tenant?.name ?? "",
    ].join("\n");
    return { slip, subject, body, ref };
  }

  /** الصيغة الافتراضية (الموضوع + النصّ) لعرضها للموظف كي يعدّلها قبل الإرسال. */
  async rfqTemplate(tenantId: string, slipId: string) {
    const { subject, body } = await this.rfqContext(tenantId, slipId);
    return { subject, body };
  }

  /**
   * إرسال طلب العرض (RFQ) للشركات المختارة — مع **موضوع ونصّ قابلين للتعديل** و**نسخة كربونية (CC)**.
   * إن لم يُمرَّر subject/body تُستخدم الصيغة الافتراضية. CC يُنقّى ويُطبَّق على كل رسالة.
   */
  async sendRfq(
    tenantId: string,
    userId: string,
    slipId: string,
    recipients: Array<{ insurerId: string; email?: string }>,
    opts?: { subject?: string; body?: string; cc?: string[] },
  ) {
    if (!recipients?.length) throw new BadRequestException("اختر شركة تأمين واحدة على الأقل");
    const { slip, subject: defSubject, body: defBody, ref } = await this.rfqContext(tenantId, slipId);
    if (slip.status === "SELECTED" || slip.status === "CLOSED") throw new ConflictException("لا يمكن إرسال طلب أسعار بعد الإسناد أو الإغلاق");

    const subject = (opts?.subject ?? "").trim() || defSubject;
    const body = (opts?.body ?? "").trim() || defBody;
    const cc = [...new Set((opts?.cc ?? []).map((c) => c.trim().toLowerCase()).filter((c) => /.+@.+\..+/.test(c)))].slice(0, 20);

    const overrideById = new Map(recipients.map((r) => [r.insurerId, r.email?.trim()]));
    const insurers = await this.prisma.insurer.findMany({ where: { tenantId, id: { in: recipients.map((r) => r.insurerId) } }, select: { id: true, name: true, contactEmail: true } });

    const sent: Array<{ name: string; email: string }> = [];
    const skipped: Array<{ name: string; reason: string }> = [];
    for (const ins of insurers) {
      const email = overrideById.get(ins.id) || ins.contactEmail; // البريد الفوري يتجاوز/يكمل السجلّ
      if (!email) { skipped.push({ name: ins.name, reason: "no_email" }); continue; }
      const res = await this.email.sendTenantEmail(tenantId, email, subject, body, "ar", cc.length ? cc : undefined);
      if (res.ok) sent.push({ name: ins.name, email });
      else skipped.push({ name: ins.name, reason: "send_failed" });
    }

    // سجّل مَن أُرسِل إليهم على الـslip (اتحاد بلا تكرار) لعرض «أُرسل إلى»
    if (sent.length) {
      const names = [...new Set([...(slip.insurers ?? []), ...sent.map((s) => s.name)])];
      await this.prisma.slip.update({ where: { id: slip.id }, data: { insurers: names } });
    }
    await this.audit.log({ tenantId, userId, action: "update", entity: "slip_rfq_sent", entityId: slip.id, meta: { sent: sent.map((s) => s.name), skipped: skipped.map((s) => s.name), ref, cc, edited: !!(opts?.subject || opts?.body) } });
    return { sent, skipped };
  }

  async addQuotation(tenantId: string, userId: string, slipId: string, dto: CreateQuotationDto) {
    const slip = await this.prisma.slip.findFirst({ where: { id: slipId } });
    if (!slip) throw new NotFoundException("طلب الأسعار غير موجود");
    if (slip.status === "SELECTED" || slip.status === "CLOSED") {
      throw new ConflictException("طلب الأسعار مُغلق — لا يمكن إضافة عروض");
    }

    const quotation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.quotation.create({
        data: {
          tenantId,
          slipId,
          insurerName: dto.insurerName,
          rate: dto.rate ?? null,
          sumInsured: dto.sumInsured ?? null,
          premium: dto.premium ?? null,
          policyFees: dto.policyFees ?? null,
          vat: dto.vat ?? null,
          totalPremium: dto.totalPremium ?? null,
          commissionRate: dto.commissionRate ?? null,
          commissionAmount: dto.commissionAmount ?? null,
          commissionVat: dto.commissionVat ?? null,
          deductible: dto.deductible ?? null,
          limit: dto.limit ?? null,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          coverFields: dto.coverFields ? asJson(dto.coverFields) : undefined,
          generalRemarks: dto.generalRemarks ?? null,
          additionalConditions: dto.additionalConditions ?? null,
        },
      });
      if (slip.status === "DRAFT" || slip.status === "SENT") {
        await tx.slip.update({ where: { id: slipId }, data: { status: "QUOTED" } });
      }
      return created;
    });

    await this.audit.log({ tenantId, userId, action: "create", entity: "quotation", entityId: quotation.id, meta: { slipId, insurer: dto.insurerName } });
    // إشعار فريق التسعير بعرض سعر جديد على طلب الأسعار
    void this.notifications.notifyStaff(tenantId, "staff_quotation_added", { insurer: dto.insurerName, ref: slip.sequenceNo ?? slipId }).catch(() => undefined);
    return quotation;
  }

  /** جدول المقارنة الآلي — يُبنى من الحقول المعيارية للعروض. */
  async comparison(slipId: string) {
    const slip = await this.prisma.slip.findFirst({
      where: { id: slipId },
      include: { quotations: { orderBy: { createdAt: "asc" } } },
    });
    if (!slip) throw new NotFoundException("طلب الأسعار غير موجود");

    const columns = [
      { key: "sumInsured", labelAr: "مبلغ التأمين", labelEn: "Sum insured" },
      { key: "rate", labelAr: "معدّل القسط", labelEn: "Premium rate" },
      { key: "premium", labelAr: "القسط الصافي", labelEn: "Net premium" },
      { key: "policyFees", labelAr: "رسوم الوثيقة", labelEn: "Policy fees" },
      { key: "vat", labelAr: "الضريبة", labelEn: "VAT" },
      { key: "totalPremium", labelAr: "الإجمالي", labelEn: "Total premium" },
      { key: "commissionAmount", labelAr: "العمولة", labelEn: "Commission" },
      { key: "commissionVat", labelAr: "ضريبة العمولة", labelEn: "Commission VAT" },
      { key: "deductible", labelAr: "التحمّل", labelEn: "Deductible" },
      { key: "limit", labelAr: "حد التغطية", labelEn: "Limit" },
    ];

    const rows = slip.quotations.map((q) => ({
      id: q.id,
      insurer: q.insurerName,
      status: q.status,
      sumInsured: num(q.sumInsured),
      rate: num(q.rate),
      premium: num(q.premium),
      policyFees: num(q.policyFees),
      vat: num(q.vat),
      totalPremium: num(q.totalPremium),
      commissionRate: num(q.commissionRate),
      commissionAmount: num(q.commissionAmount),
      commissionVat: num(q.commissionVat),
      deductible: num(q.deductible),
      limit: num(q.limit),
      generalRemarks: q.generalRemarks,
    }));

    const priced = rows.filter((r) => r.totalPremium != null || r.premium != null);
    const best = priced.length
      ? priced.reduce((a, b) => ((b.totalPremium ?? b.premium)! < (a.totalPremium ?? a.premium)! ? b : a))
      : null;

    return { slipId: slip.id, sequenceNo: slip.sequenceNo, status: slip.status, columns, rows, bestByPrice: best?.id ?? null };
  }

  /** أمر الإسناد (Firm Order): اختيار العرض ⇒ الطلب AWARDED (جاهز للإصدار 4ب). */
  async selectQuotation(tenantId: string, userId: string, slipId: string, quotationId: string) {
    const slip = await this.prisma.slip.findFirst({ where: { id: slipId }, include: { quotations: true } });
    if (!slip) throw new NotFoundException("طلب الأسعار غير موجود");
    if (!slip.quotations.some((q) => q.id === quotationId)) {
      throw new NotFoundException("العرض غير موجود ضمن طلب الأسعار");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.quotation.updateMany({ where: { slipId }, data: { status: "REJECTED" } });
      await tx.quotation.update({ where: { id: quotationId }, data: { status: "SELECTED" } });
      await tx.slip.update({ where: { id: slipId }, data: { status: "SELECTED", selectedQuotationId: quotationId } });
      await tx.policyRequest.update({ where: { id: slip.requestId }, data: { status: "AWARDED" } });
    });

    await this.audit.log({ tenantId, userId, action: "approve", entity: "firm_order", entityId: slipId, meta: { quotationId, requestId: slip.requestId } });
    return { slipId, selectedQuotationId: quotationId, requestStatus: "AWARDED" };
  }

  /**
   * عرض العروض المنتقاة على العميل عبر البوّابة (§4.1) — يختار الوسيط ما يُظهره (عادةً المُوصى به + بدائل)
   * ويبدأ قرار العميل (`pending`). العميل يقبل عرضًا (⇒ أمر إسناد) أو يرفض عبر بوّابته.
   */
  async present(tenantId: string, userId: string, slipId: string, quotationIds: string[]) {
    const slip = await this.prisma.slip.findFirst({
      where: { id: slipId },
      include: { quotations: { select: { id: true } }, request: { select: { clientId: true, client: { select: { email: true, phone: true } } } } },
    });
    if (!slip) throw new NotFoundException("طلب الأسعار غير موجود");
    if (slip.status === "SELECTED" || slip.status === "CLOSED") throw new ConflictException("لا يمكن عرض طلب أسعار مُسنَد/مغلق");
    if (!slip.request.clientId) throw new UnprocessableEntityException("لا عميل مرتبط بهذا الطلب — لا يمكن العرض عبر البوّابة");
    const ids = [...new Set(quotationIds)].filter((id) => slip.quotations.some((q) => q.id === id));
    if (ids.length === 0) throw new BadRequestException("اختر عرضًا واحدًا على الأقل للعرض على العميل");
    await this.prisma.slip.update({
      where: { id: slipId },
      data: { presentedAt: new Date(), presentedQuotationIds: ids, clientDecision: "pending", clientDecidedAt: null, acceptedQuotationId: null, clientDecisionNote: null },
    });
    await this.audit.log({ tenantId, userId, action: "present", entity: "proposal", entityId: slipId, meta: { quotationIds: ids } });
    const c = slip.request.client;
    void this.notifications.notify(tenantId, "proposal_ready", { email: c?.email ?? undefined, phone: c?.phone ?? undefined, clientId: slip.request.clientId }, { ref: String(slip.sequenceNo ?? slipId) }).catch(() => undefined);
    return { slipId, presentedQuotationIds: ids, clientDecision: "pending" };
  }
}
