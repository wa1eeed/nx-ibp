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

  /** خطوات الاعتماد الإضافية للوثيقة (مرتّبة). فارغة إن لم تُهيَّأ. */
  async getPolicyApprovalSteps(tenantId: string): Promise<ApprovalStep[]> {
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { approvalChains: true } });
    const chains = (cfg?.approvalChains ?? {}) as { policy?: { extraSteps?: ApprovalStep[] } };
    return Array.isArray(chains.policy?.extraSteps) ? chains.policy!.extraSteps! : [];
  }

  /** يحفظ خطوات الاعتماد الإضافية للوثيقة بعد التحقّق. */
  async setPolicyApprovalSteps(tenantId: string, userId: string, steps: ApprovalStep[]): Promise<{ ok: true; steps: ApprovalStep[] }> {
    const clean = this.validate(steps);
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { id: true, approvalChains: true } });
    const chains = { ...((cfg?.approvalChains ?? {}) as Record<string, unknown>), policy: { extraSteps: clean } };
    if (cfg) await this.prisma.tenantConfig.update({ where: { tenantId }, data: { approvalChains: asJson(chains) } });
    else await this.prisma.tenantConfig.create({ data: { tenantId, enabledProducts: [], approvalChains: asJson(chains) } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "approval_chain", entityId: "policy", meta: { steps: clean.length } });
    return { ok: true, steps: clean };
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
