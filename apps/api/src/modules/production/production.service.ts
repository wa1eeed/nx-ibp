import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { IssuePolicyDto } from "./dto/issue-policy.dto";

const POLICY_FIELDS = {
  id: true,
  sequenceNo: true,
  status: true,
  insurerName: true,
  premium: true,
  vat: true,
  totalPremium: true,
  commissionRate: true,
  commissionAmount: true,
  insurerPolicyNo: true,
  issuanceType: true,
  issueDate: true,
  policyFees: true,
  sumInsured: true,
  paymentTerms: true,
  producerName: true,
  producerCommission: true,
  productLineCode: true,
  clientId: true,
  requestId: true,
  tenantId: true,
} as const;

/**
 * الإنتاج (المرحلة 4ب): إصدار الوثيقة من طلب AWARDED، والموافقة الفنية (Underwriter)
 * كطبقة تدقيق أولى قبل تمرير المعاملة للاعتماد المالي.
 */
@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  list() {
    return this.prisma.policy.findMany({ orderBy: { createdAt: "desc" }, select: POLICY_FIELDS });
  }

  async getOne(id: string) {
    const policy = await this.prisma.policy.findFirst({ where: { id }, select: POLICY_FIELDS });
    if (!policy) throw new NotFoundException("الوثيقة غير موجودة");
    return policy;
  }

  /** إصدار وثيقة من طلب أُسند عرضه (Firm Order). */
  async issuePolicy(tenantId: string, userId: string, dto: IssuePolicyDto) {
    const request = await this.prisma.policyRequest.findFirst({
      where: { id: dto.requestId },
      include: { slips: { where: { status: "SELECTED" }, include: { quotations: true } } },
    });
    if (!request) throw new NotFoundException("الطلب غير موجود");
    if (request.status !== "AWARDED") {
      throw new ConflictException("الطلب ليس في حالة AWARDED (يلزم أمر إسناد Firm Order أولاً)");
    }

    const slip = request.slips[0];
    const quotation = slip?.quotations.find((q) => q.id === slip.selectedQuotationId);
    if (!quotation) throw new ConflictException("لا يوجد عرض مُختار لهذا الطلب");

    const branchCode = dto.branchCode ?? (await this.prisma.branch.findFirst({ orderBy: { code: "asc" } }))?.code ?? "RUH";
    const line = await this.prisma.productLine.findFirst({ where: { code: request.productLineCode }, include: { class: true } });
    const sequenceNo = await this.seq.nextPolicySeq(branchCode, line?.class.code ?? "GEN");

    const premium = Number(quotation.premium ?? 0);
    const vat = Number(quotation.vat ?? +(premium * 0.15).toFixed(2));
    const total = Number(quotation.totalPremium ?? premium + vat);
    const rate = dto.commissionRate ?? 12.5;
    const commission = +((premium * rate) / 100).toFixed(2);

    const policy = await this.prisma.$transaction(async (tx) => {
      const created = await tx.policy.create({
        data: {
          tenantId,
          requestId: request.id,
          clientId: request.clientId,
          productLineCode: request.productLineCode,
          insurerName: quotation.insurerName,
          sequenceNo,
          premium,
          vat,
          totalPremium: total,
          commissionRate: rate,
          commissionAmount: commission,
          // حقول الوثيقة المعيارية
          insurerPolicyNo: dto.insurerPolicyNo ?? null,
          issuanceType: dto.issuanceType ?? "POLICY",
          issueDate: new Date(),
          policyFees: dto.policyFees ?? null,
          sumInsured: dto.sumInsured ?? null,
          paymentTerms: dto.paymentTerms ?? null,
          producerName: dto.producerName ?? null,
          producerCommission: dto.producerCommission ?? null,
          status: "TECHNICAL_REVIEW",
        },
        select: POLICY_FIELDS,
      });
      await tx.policyRequest.update({ where: { id: request.id }, data: { status: "UNDER_REVIEW" } });
      return created;
    });

    await this.audit.log({ tenantId, userId, action: "create", entity: "policy", entityId: policy.id, meta: { sequenceNo, insurer: quotation.insurerName } });

    // إشعار العميل بإصدار الوثيقة (لا يُفشل الإصدار عند تعذّره)
    if (request.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: request.clientId }, select: { email: true, phone: true } });
      if (client) void this.notifications.notify(tenantId, "policy_issued", { email: client.email ?? undefined, phone: client.phone ?? undefined }, { sequenceNo }).catch(() => undefined);
    }
    return policy;
  }

  /** الموافقة الفنية ⇒ تنتقل الوثيقة للاعتماد المالي. */
  async approveTechnical(tenantId: string, userId: string, policyId: string) {
    const policy = await this.prisma.policy.findFirst({ where: { id: policyId } });
    if (!policy) throw new NotFoundException("الوثيقة غير موجودة");
    if (policy.status !== "TECHNICAL_REVIEW") {
      throw new ConflictException("الوثيقة ليست بانتظار الموافقة الفنية");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.policy.update({ where: { id: policyId }, data: { status: "FINANCE_REVIEW" } });
      if (policy.requestId) await tx.policyRequest.update({ where: { id: policy.requestId }, data: { status: "FINANCE_REVIEW" } });
    });

    await this.audit.log({ tenantId, userId, action: "approve", entity: "policy_technical", entityId: policyId });
    return { policyId, status: "FINANCE_REVIEW" };
  }
}
