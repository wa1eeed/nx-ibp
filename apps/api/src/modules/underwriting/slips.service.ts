import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
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
        tenantId: true,
        request: { select: { id: true, productLineCode: true, client: { select: { id: true, name: true } } } },
        quotations: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!slip) throw new NotFoundException("طلب الأسعار غير موجود");
    return slip;
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
          premium: dto.premium ?? null,
          vat: dto.vat ?? null,
          totalPremium: dto.totalPremium ?? null,
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
      { key: "rate", labelAr: "النسبة", labelEn: "Rate" },
      { key: "premium", labelAr: "القسط الصافي", labelEn: "Net premium" },
      { key: "vat", labelAr: "الضريبة", labelEn: "VAT" },
      { key: "totalPremium", labelAr: "الإجمالي", labelEn: "Total premium" },
      { key: "deductible", labelAr: "التحمّل", labelEn: "Deductible" },
      { key: "limit", labelAr: "حد التغطية", labelEn: "Limit" },
    ];

    const rows = slip.quotations.map((q) => ({
      id: q.id,
      insurer: q.insurerName,
      status: q.status,
      rate: num(q.rate),
      premium: num(q.premium),
      vat: num(q.vat),
      totalPremium: num(q.totalPremium),
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
}
