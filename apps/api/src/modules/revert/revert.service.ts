import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { PermissionService } from "../rbac/permission.service";
import type { RbacModule } from "../rbac/rbac.constants";
import type { AuthUser } from "../auth/current-user.decorator";

/** قاعدة التراجع لكيان آلة حالة: سلسلة الحالات الأمامية + الوحدة المخوّلة + الحالات النهائية غير القابلة للتراجع. */
interface RevertRule {
  model: "policy" | "claim" | "serviceRequest" | "policyRequest";
  module: RbacModule;
  chain: string[];
  irreversible: string[];
  labelAr: string;
}

/**
 * محرّك التراجع خطوة للوراء (E4). كيانات آلة الحالة تُرجَع خطوة واحدة لسابقتها في السلسلة،
 * محكوم بصلاحية `canRevert` للوحدة (للمشرف)، مع **حواجز امتثالية**:
 *  - الحالات النهائية/المالية غير قابلة للتراجع (إصدار الوثيقة ⇒ التزام مالي/ZATCA ⇒ يلزم إجراء تعويضي).
 *  - التراجع **إجراء مُدقَّق جديد** (لا يمحو التاريخ — يحفظ ثبات السجلّ).
 */
@Injectable()
export class RevertService {
  private readonly rules: Record<string, RevertRule> = {
    policy: { model: "policy", module: "production", chain: ["TECHNICAL_REVIEW", "FINANCE_REVIEW"], irreversible: ["ISSUED", "CANCELLED", "REJECTED"], labelAr: "الوثيقة" },
    claim: { model: "claim", module: "claims", chain: ["RECEIVED", "UNDER_REVIEW", "SUBMITTED", "SETTLED", "CLOSED"], irreversible: [], labelAr: "المطالبة" },
    service_request: { model: "serviceRequest", module: "service", chain: ["OPEN", "IN_PROGRESS", "SENT_TO_INSURER", "CLOSED"], irreversible: [], labelAr: "طلب الخدمة" },
    request: { model: "policyRequest", module: "production", chain: ["DRAFT", "QUOTING", "AWARDED"], irreversible: ["ISSUED", "REJECTED"], labelAr: "الطلب" },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionService,
  ) {}

  /** يتراجع بكيان خطوة واحدة للوراء بعد التحقّق من الصلاحية والحواجز الامتثالية. */
  async revert(user: AuthUser, entityType: string, id: string) {
    const rule = this.rules[entityType];
    if (!rule) throw new BadRequestException("نوع كيان غير مدعوم للتراجع");

    const allowed = await this.permissions.can(user.roleId, rule.module, "revert");
    if (!allowed) throw new ForbiddenException("لا تملك صلاحية التراجع في هذه الوحدة");

    // القراءة معزولة بالمستأجر تلقائيًا (middleware)
    const entity = await (this.prisma as unknown as Record<string, { findFirst: (a: unknown) => Promise<{ id: string; status: string } | null> }>)[rule.model]
      .findFirst({ where: { id }, select: { id: true, status: true } });
    if (!entity) throw new NotFoundException(`${rule.labelAr} غير موجود`);
    const current = entity.status;

    if (rule.irreversible.includes(current)) {
      if (rule.model === "policy" && current === "ISSUED") {
        throw new ConflictException("الوثيقة مُصدَرة — التراجع يتطلّب إجراءً تعويضيًا (إشعار دائن/قيد عكسي)، ولا يُسمح كتراجع مباشر (التزام مالي/ZATCA).");
      }
      throw new ConflictException(`لا يمكن التراجع عن ${rule.labelAr} في حالة نهائية (${current}).`);
    }

    const idx = rule.chain.indexOf(current);
    if (idx <= 0) throw new ConflictException(`${rule.labelAr} في الحالة الأولى — لا توجد خطوة سابقة للتراجع إليها.`);
    const prev = rule.chain[idx - 1];

    await this.prisma.$transaction(async (tx) => {
      await (tx as unknown as Record<string, { update: (a: unknown) => Promise<unknown> }>)[rule.model]
        .update({ where: { id }, data: { status: prev as never } });
      // معالجة خاصة بالوثيقة: تفريغ خطوات الاعتماد الإضافية + إرجاع الطلب المرتبط
      if (rule.model === "policy") {
        const pol = await tx.policy.findFirst({ where: { id }, select: { requestId: true } });
        await tx.policy.update({ where: { id }, data: { pendingApprovals: [] } });
        if (pol?.requestId) await tx.policyRequest.update({ where: { id: pol.requestId }, data: { status: "UNDER_REVIEW" } });
      }
    });

    await this.audit.log({ tenantId: user.tenantId, userId: user.userId, action: "revert", entity: entityType, entityId: id, meta: { from: current, to: prev } });
    return { entityType, id, from: current, to: prev };
  }
}
