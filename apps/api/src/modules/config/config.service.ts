import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { RBAC_MODULES, type RbacModule, type RbacAction } from "../rbac/rbac.constants";

/** خطوة اعتماد إضافية قابلة للتهيئة ضمن سلسلة اعتماد الوثيقة (E2). */
export interface ApprovalStep {
  key: string; // مُعرّف فريد (slug) داخل السلسلة
  name: string; // اسم معروض
  module: RbacModule; // الوحدة المطلوبة صلاحيتها للموافقة على هذه الخطوة
  action: RbacAction; // الفعل المطلوب (افتراضي update)
}

const ACTIONS: RbacAction[] = ["read", "create", "update", "delete"];
const asJson = (v: unknown) => v as Prisma.InputJsonValue;

/** إعداد سلسلة اعتماد الوثيقة: بوّابة الموافقة الفنية + فصل المهام + خطوات إضافية. */
export interface PolicyApprovalConfig {
  technicalGate: boolean; // هل الموافقة الفنية مطلوبة؟ (افتراضي true)
  segregationOfDuties: boolean; // فصل المهام: المعتمِد المالي ≠ المُصدِر (افتراضي true — توصية رقابية)
  extraSteps: ApprovalStep[];
}

/**
 * إعدادات المستأجر القابلة للتهيئة (E2 وما بعده). حاليًا: **سلاسل اعتماد الوثيقة** —
 * خطوات موافقة إضافية (بين الفني والمالي) يعرّفها مالك الحساب، لكل خطوة وحدتها/فعلها المطلوب.
 * فارغة = السلسلة الافتراضية (فني ⇒ مالي). معزول بالمستأجر.
 */
@Injectable()
export class ConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** إعداد سلسلة اعتماد الوثيقة: بوّابة فنية (افتراضي مفعّلة) + خطوات إضافية. */
  async getPolicyApprovalConfig(tenantId: string): Promise<PolicyApprovalConfig> {
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { approvalChains: true } });
    const policy = ((cfg?.approvalChains ?? {}) as { policy?: { technicalGate?: boolean; segregationOfDuties?: boolean; extraSteps?: ApprovalStep[] } }).policy ?? {};
    return {
      technicalGate: policy.technicalGate !== false, // افتراضيًا مفعّلة
      segregationOfDuties: policy.segregationOfDuties !== false, // افتراضيًا مفعّل
      extraSteps: Array.isArray(policy.extraSteps) ? policy.extraSteps : [],
    };
  }

  /** خطوات الاعتماد الإضافية فقط (مرتّبة). */
  async getPolicyApprovalSteps(tenantId: string): Promise<ApprovalStep[]> {
    return (await this.getPolicyApprovalConfig(tenantId)).extraSteps;
  }

  /** يحفظ إعداد سلسلة اعتماد الوثيقة (البوّابة الفنية + الخطوات) بعد التحقّق. */
  async setPolicyApprovalConfig(tenantId: string, userId: string, input: { technicalGate?: boolean; segregationOfDuties?: boolean; steps: ApprovalStep[] }): Promise<{ ok: true } & PolicyApprovalConfig> {
    const extraSteps = this.validate(input.steps);
    const technicalGate = input.technicalGate !== false;
    const segregationOfDuties = input.segregationOfDuties !== false;
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { id: true, approvalChains: true } });
    const chains = { ...((cfg?.approvalChains ?? {}) as Record<string, unknown>), policy: { technicalGate, segregationOfDuties, extraSteps } };
    if (cfg) await this.prisma.tenantConfig.update({ where: { tenantId }, data: { approvalChains: asJson(chains) } });
    else await this.prisma.tenantConfig.create({ data: { tenantId, enabledProducts: [], approvalChains: asJson(chains) } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "approval_chain", entityId: "policy", meta: { technicalGate, segregationOfDuties, steps: extraSteps.length } });
    return { ok: true, technicalGate, segregationOfDuties, extraSteps };
  }

  // ————————————————— سياسة الأمان (إلزام MFA) —————————————————

  /** سياسة الأمان على مستوى الشركة. حاليًا: إلزام المصادقة الثنائية لكل الموظفين. */
  async getSecurityConfig(tenantId: string): Promise<{ mfaRequired: boolean }> {
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { securityPolicy: true } });
    const sp = (cfg?.securityPolicy ?? {}) as { mfaRequired?: boolean };
    return { mfaRequired: sp.mfaRequired === true };
  }

  /** يحفظ سياسة الأمان. تفعيل الإلزام لا يُعطّل دخول من لم يُسجّل بعد، بل تدفعه الواجهة للتسجيل. */
  async setSecurityConfig(tenantId: string, userId: string, input: { mfaRequired: boolean }): Promise<{ ok: true; mfaRequired: boolean }> {
    const mfaRequired = input.mfaRequired === true;
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { id: true, securityPolicy: true } });
    const policy = { ...((cfg?.securityPolicy ?? {}) as Record<string, unknown>), mfaRequired };
    if (cfg) await this.prisma.tenantConfig.update({ where: { tenantId }, data: { securityPolicy: asJson(policy) } });
    else await this.prisma.tenantConfig.create({ data: { tenantId, enabledProducts: [], securityPolicy: asJson(policy) } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "security_policy", entityId: "mfa", meta: { mfaRequired } });
    return { ok: true, mfaRequired };
  }

  /** يتحقّق من صحّة الخطوات (مفاتيح فريدة غير فارغة، وحدة/فعل صالحان). */
  private validate(steps: ApprovalStep[]): ApprovalStep[] {
    if (!Array.isArray(steps)) throw new BadRequestException("سلسلة الاعتماد يجب أن تكون قائمة خطوات");
    const seen = new Set<string>();
    return steps.map((s, i) => {
      const key = String(s.key ?? "").trim();
      if (!key) throw new BadRequestException(`الخطوة ${i + 1}: مفتاح مطلوب`);
      if (seen.has(key)) throw new BadRequestException(`الخطوة ${i + 1}: المفتاح «${key}» مكرّر`);
      seen.add(key);
      if (!(RBAC_MODULES as readonly string[]).includes(s.module)) throw new BadRequestException(`الخطوة «${key}»: وحدة غير معروفة`);
      const action = (s.action ?? "update") as RbacAction;
      if (!ACTIONS.includes(action)) throw new BadRequestException(`الخطوة «${key}»: فعل غير معروف`);
      return { key, name: String(s.name ?? key).trim() || key, module: s.module, action };
    });
  }
}
