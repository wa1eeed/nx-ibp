import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { AuthUser } from "../auth/current-user.decorator";
import type { CreateStaffDto } from "./dto/create-staff.dto";

/**
 * إدارة موظفي المستأجر. كل العمليات معزولة تلقائياً بالمستأجر (Prisma middleware).
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  list() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        tenantId: true,
        role: { select: { id: true, name: true, isPreset: true } },
      },
    });
  }

  /**
   * تفاصيل موظف 360° — بياناته/دوره/قسمه + **ما تحت مسؤوليته** (وثائق أصدرها · صفقاته · مهامه)
   * + نشاطه (من سجل التدقيق) + مؤشرات الإنتاجية. معزول بالمستأجر.
   */
  async detail(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id },
      select: { id: true, fullName: true, email: true, status: true, mfaEnabled: true, createdAt: true, role: { select: { name: true, isPreset: true } }, department: { select: { name: true } } },
    });
    if (!user) throw new NotFoundException("المستخدم غير موجود");
    const [activity, totalActions, policiesCreated, approvals, deals, tasks, issuedAudit] = await Promise.all([
      this.prisma.auditLog.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 60, select: { action: true, entity: true, entityId: true, meta: true, createdAt: true } }),
      this.prisma.auditLog.count({ where: { userId: id } }),
      this.prisma.auditLog.count({ where: { userId: id, entity: "policy", action: "create" } }),
      this.prisma.auditLog.count({ where: { userId: id, action: "approve" } }),
      this.prisma.deal.findMany({ where: { assigneeId: id, status: "open" }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, stage: true, value: true, clientId: true } }),
      this.prisma.crmTask.findMany({ where: { assigneeId: id, status: "open" }, orderBy: { dueDate: "asc" }, select: { id: true, title: true, priority: true, dueDate: true } }),
      this.prisma.auditLog.findMany({ where: { userId: id, entity: "policy", action: "create" }, orderBy: { createdAt: "desc" }, take: 100, select: { entityId: true } }),
    ]);
    // الوثائق التي أصدرها/تحت مسؤوليته (من سجل التدقيق ⇒ الوثائق الفعلية)
    const policyIds = [...new Set(issuedAudit.map((a) => a.entityId).filter((x): x is string => !!x))];
    const policies = policyIds.length
      ? await this.prisma.policy.findMany({ where: { id: { in: policyIds } }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, insurerName: true, productLineCode: true, totalPremium: true, status: true, endDate: true } })
      : [];
    // إثراء الصفقات باسم العميل
    const clientIds = [...new Set(deals.map((d) => d.clientId).filter((x): x is string => !!x))];
    const clients = clientIds.length ? await this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : [];
    const cn = Object.fromEntries(clients.map((c) => [c.id, c.name]));
    const dealsEnriched = deals.map((d) => ({ ...d, clientName: d.clientId ? cn[d.clientId] ?? null : null }));
    return { user, activity, stats: { totalActions, policiesCreated, approvals }, policies, deals: dealsEnriched, tasks };
  }

  /** قوالب الأدوار الجاهزة لتعبئة مصفوفة الصلاحيات في الشاشة. */
  roleTemplates() {
    return this.prisma.role.findMany({
      where: { isPreset: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        permissions: {
          select: { module: true, canAccess: true, canCreate: true, canEdit: true, canDelete: true, canRevert: true },
        },
      },
    });
  }

  /**
   * إنشاء موظف: دور مخصّص من المصفوفة + مستخدم بكلمة مرور.
   * tenantId يُمرَّر صراحةً من سياق المستخدم (ويطابقه Prisma middleware أيضاً).
   */
  async create(tenantId: string, dto: CreateStaffDto) {
    const existing = await this.prisma.user.findFirst({ where: { email: dto.email } });
    if (existing) throw new ConflictException("البريد مستخدم مسبقاً في هذا المستأجر");

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          tenantId,
          name: dto.roleName,
          isPreset: false,
          permissions: {
            create: dto.permissions.map((p) => ({
              module: p.module,
              canAccess: p.canAccess,
              canCreate: p.canCreate,
              canEdit: p.canEdit,
              canDelete: p.canDelete,
              canRevert: p.canRevert ?? false,
            })),
          },
        },
      });

      return tx.user.create({
        data: {
          tenantId,
          email: dto.email,
          fullName: dto.fullName,
          passwordHash,
          status: "ACTIVE",
          roleId: role.id,
        },
        select: { id: true, fullName: true, email: true, status: true, tenantId: true, roleId: true },
      });
    });

    await this.audit.log({
      tenantId,
      action: "create",
      entity: "user",
      entityId: user.id,
      meta: { email: user.email, roleName: dto.roleName },
    });

    // إشعار إداري بإضافة مستخدم جديد للحساب
    void this.notifications.notifyStaff(tenantId, "staff_member_added", { name: dto.fullName, role: dto.roleName }).catch(() => undefined);

    return user;
  }

  /**
   * إعادة تعيين المصادقة الثنائية لموظف (تعطيلها) — يستخدمها أدمن الشركة عند فقدان الجهاز.
   * يمحو السرّ ويُطفئ التفعيل؛ يعيد الموظف التسجيل لاحقًا (يُدفع تلقائيًا إن كانت مُلزَمة).
   */
  async resetMfa(admin: AuthUser, id: string) {
    const target = await this.prisma.user.findFirst({ where: { id }, select: { id: true, email: true, mfaEnabled: true } });
    if (!target) throw new NotFoundException("الموظف غير موجود");
    await this.prisma.user.update({ where: { id }, data: { mfaEnabled: false, mfaSecret: null } });
    await this.audit.log({ tenantId: admin.tenantId, userId: admin.userId, action: "update", entity: "user_mfa_reset", entityId: id, meta: { target: target.email, wasEnabled: target.mfaEnabled } });
    return { ok: true, enabled: false };
  }
}
