import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ConfigService } from "../config/config.service";
import { PermissionService } from "../rbac/permission.service";
import { vatTreatmentForClass } from "../../common/tax/vat";
import type { RbacAction } from "../rbac/rbac.constants";
import type { AuthUser } from "../auth/current-user.decorator";
import type { IssuePolicyDto } from "./dto/issue-policy.dto";
import type { CreateEndorsementDto } from "./dto/create-endorsement.dto";

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
  pendingApprovals: true,
  startDate: true,
  endDate: true,
  createdAt: true,
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
    private readonly config: ConfigService,
    private readonly permissions: PermissionService,
  ) {}

  list() {
    return this.prisma.policy.findMany({ orderBy: { createdAt: "desc" }, select: POLICY_FIELDS });
  }

  async getOne(id: string) {
    const policy = await this.prisma.policy.findFirst({ where: { id }, select: POLICY_FIELDS });
    if (!policy) throw new NotFoundException("الوثيقة غير موجودة");
    return policy;
  }

  /**
   * إضافة ملحق (Endorsement) على وثيقة مُصدَرة — تعديل/إضافة/حذف/إلغاء بتاريخ سريان وفرق قسط اختياري.
   * الرقم التسلسلي `POL-…/E{n}`. لا يُسمح على غير المُصدَرة (409).
   */
  async addEndorsement(user: AuthUser, policyId: string, dto: CreateEndorsementDto) {
    const policy = await this.prisma.policy.findFirst({ where: { id: policyId }, select: { id: true, sequenceNo: true, status: true } });
    if (!policy) throw new NotFoundException("الوثيقة غير موجودة");
    if (policy.status !== "ISSUED") throw new ConflictException("لا يمكن إضافة ملحق إلا على وثيقة مُصدَرة");
    const count = await this.prisma.endorsement.count({ where: { policyId } });
    const endo = await this.prisma.endorsement.create({
      data: {
        tenantId: user.tenantId,
        policyId,
        sequenceNo: `${policy.sequenceNo ?? policyId}/E${count + 1}`,
        type: dto.type,
        effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : null,
        premiumDelta: dto.premiumDelta ?? null,
        details: dto.reason ? ({ reason: dto.reason } as Prisma.InputJsonValue) : undefined,
        status: "ISSUED",
      },
      select: { id: true, sequenceNo: true, type: true, effectiveDate: true, premiumDelta: true, status: true, createdAt: true },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.userId, action: "create", entity: "endorsement", entityId: endo.id, meta: { policyId, type: dto.type } });
    return endo;
  }

  /**
   * نظرة 360° للوثيقة — كل ما يخصّها (معزول بالمستأجر تلقائيًا):
   * المالية الكاملة · العميل · الملاحق · المطالبات · إشعارات المدين/الفواتير · المستندات · الخط الزمني.
   */
  async overview(id: string) {
    const policy = await this.prisma.policy.findFirst({ where: { id }, select: POLICY_FIELDS });
    if (!policy) throw new NotFoundException("الوثيقة غير موجودة");
    const [client, endorsements, claims, debitNotes, invoices, activity] = await Promise.all([
      policy.clientId ? this.prisma.client.findFirst({ where: { id: policy.clientId }, select: { id: true, name: true, type: true, code: true } }) : null,
      this.prisma.endorsement.findMany({ where: { policyId: id }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, type: true, effectiveDate: true, premiumDelta: true, status: true, createdAt: true } }),
      this.prisma.claim.findMany({ where: { policyId: id }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, insurerName: true, claimedAmount: true, settledAmount: true, status: true, incidentDate: true, createdAt: true } }),
      this.prisma.debitNote.findMany({ where: { policyId: id }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, netAmount: true, vatAmount: true, createdAt: true } }),
      this.prisma.invoice.findMany({ where: { policyId: id }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, status: true, netAmount: true, vatAmount: true, totalAmount: true, createdAt: true } }),
      this.prisma.auditLog.findMany({ where: { entity: "policy", entityId: id }, orderBy: { createdAt: "desc" }, take: 60, select: { action: true, meta: true, createdAt: true } }),
    ]);
    const documents = await this.prisma.document.findMany({ where: { entityId: id }, orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, docType: true, createdAt: true } });
    const n = (d: unknown) => (d == null ? 0 : Number(d));
    const commissionTotal = n(policy.commissionAmount);
    return {
      policy,
      client,
      endorsements,
      claims,
      debitNotes,
      invoices,
      documents,
      activity,
      summary: {
        endorsements: endorsements.length,
        claims: claims.length,
        claimsSettled: claims.reduce((s, c) => s + n(c.settledAmount), 0),
        commission: commissionTotal,
        gross: n(policy.totalPremium),
        outstanding: debitNotes.reduce((s, d) => s + n(d.netAmount) + n(d.vatAmount), 0),
      },
    };
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
    // E1 — الضريبة حسب فرع التأمين: الحياة معفاة (0%)، البقية 15%
    const treatment = vatTreatmentForClass(line?.class.code);
    const vat = treatment.rate === 0 ? 0 : Number(quotation.vat ?? +((premium * treatment.rate) / 100).toFixed(2));
    const total = Number(treatment.rate === 0 ? premium : (quotation.totalPremium ?? premium + vat));
    const rate = dto.commissionRate ?? 12.5;
    const commission = +((premium * rate) / 100).toFixed(2);

    // E2 — سلسلة الاعتماد: البوّابة الفنية قابلة للتعطيل من الشركة (المالية تبقى إلزامية)
    const approvalCfg = await this.config.getPolicyApprovalConfig(tenantId);
    const skipTechnical = !approvalCfg.technicalGate;
    const initialStatus = skipTechnical ? "FINANCE_REVIEW" : "TECHNICAL_REVIEW";
    const initialPending = skipTechnical ? approvalCfg.extraSteps.map((s) => s.key) : [];

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
          status: initialStatus,
          pendingApprovals: initialPending,
        },
        select: POLICY_FIELDS,
      });
      await tx.policyRequest.update({ where: { id: request.id }, data: { status: skipTechnical ? "FINANCE_REVIEW" : "UNDER_REVIEW" } });
      return created;
    });

    await this.audit.log({ tenantId, userId, action: "create", entity: "policy", entityId: policy.id, meta: { sequenceNo, insurer: quotation.insurerName } });

    // إشعار العميل بإصدار الوثيقة (لا يُفشل الإصدار عند تعذّره)
    if (request.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: request.clientId }, select: { email: true, phone: true } });
      if (client) void this.notifications.notify(tenantId, "policy_issued", { email: client.email ?? undefined, phone: client.phone ?? undefined, clientId: request.clientId }, { sequenceNo }).catch(() => undefined);
    }
    // إشعار المعنيّين حسب السلسلة المُهيّأة
    if (!skipTechnical) {
      void this.notifications.notifyStaff(tenantId, "staff_policy_technical_review", { sequenceNo }).catch(() => undefined);
    } else if (initialPending.length === 0) {
      void this.notifications.notifyStaff(tenantId, "staff_policy_finance_review", { sequenceNo }).catch(() => undefined);
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

    // E2 — سلسلة الاعتماد: خطوات إضافية مُهيّأة (بين الفني والمالي) تُحجز الآن على الوثيقة
    const extraSteps = await this.config.getPolicyApprovalSteps(tenantId);
    const pending = extraSteps.map((s) => s.key);

    await this.prisma.$transaction(async (tx) => {
      await tx.policy.update({ where: { id: policyId }, data: { status: "FINANCE_REVIEW", pendingApprovals: pending } });
      if (policy.requestId) await tx.policyRequest.update({ where: { id: policy.requestId }, data: { status: "FINANCE_REVIEW" } });
    });

    await this.audit.log({ tenantId, userId, action: "approve", entity: "policy_technical", entityId: policyId, meta: { pendingApprovals: pending.length } });
    // إشعار المعنيّين: إن بقيت خطوات ⇒ المعتمِدون؛ وإلا ⇒ المالية
    if (pending.length === 0) {
      void this.notifications.notifyStaff(tenantId, "staff_policy_finance_review", { sequenceNo: policy.sequenceNo ?? policyId }).catch(() => undefined);
    }
    return { policyId, status: "FINANCE_REVIEW", pendingApprovals: pending };
  }

  /**
   * E2 — الموافقة على خطوة اعتماد إضافية مُهيّأة. تتحقّق ديناميكيًا من صلاحية المستخدم
   * (وحدة/فعل الخطوة) عبر PermissionService، ثم تُفرِّغ الخطوة. لا تُصدِر الوثيقة (المالية هي الأخيرة).
   */
  async approveStep(tenantId: string, user: AuthUser, policyId: string, stepKey: string) {
    const policy = await this.prisma.policy.findFirst({ where: { id: policyId }, select: { id: true, sequenceNo: true, status: true, pendingApprovals: true, requestId: true } });
    if (!policy) throw new NotFoundException("الوثيقة غير موجودة");
    if (policy.status !== "FINANCE_REVIEW" || !policy.pendingApprovals.includes(stepKey)) {
      throw new ConflictException("لا توجد خطوة اعتماد بهذا المفتاح بانتظار الموافقة على هذه الوثيقة");
    }
    const step = (await this.config.getPolicyApprovalSteps(tenantId)).find((s) => s.key === stepKey);
    if (!step) throw new ConflictException("خطوة الاعتماد لم تعد مُهيّأة");

    const allowed = await this.permissions.can(user.roleId, step.module, (step.action ?? "update") as RbacAction);
    if (!allowed) throw new ForbiddenException(`لا تملك صلاحية الموافقة على خطوة «${step.name}»`);

    const remaining = policy.pendingApprovals.filter((k) => k !== stepKey);
    await this.prisma.policy.update({ where: { id: policyId }, data: { pendingApprovals: remaining } });
    await this.audit.log({ tenantId, userId: user.userId, action: "approve", entity: "policy_approval_step", entityId: policyId, meta: { step: stepKey, remaining: remaining.length } });
    // اكتملت الخطوات الإضافية ⇒ أبلغ المالية
    if (remaining.length === 0) {
      void this.notifications.notifyStaff(tenantId, "staff_policy_finance_review", { sequenceNo: policy.sequenceNo ?? policyId }).catch(() => undefined);
    }
    return { policyId, step: stepKey, pendingApprovals: remaining };
  }
}
