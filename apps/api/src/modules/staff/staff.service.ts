import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { auditPhase, describeAudit } from "../../common/audit/audit-describe";
import { NotificationsService } from "../notifications/notifications.service";
import type { AuthUser } from "../auth/current-user.decorator";
import type { CreateStaffDto } from "./dto/create-staff.dto";
import { RBAC_MODULES } from "../rbac/rbac.constants";

interface PermRow { module: string; canAccess: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; canRevert?: boolean }

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
      select: { id: true, fullName: true, email: true, status: true, mfaEnabled: true, createdAt: true, allowedProductLines: true, commissionRate: true, role: { select: { id: true, name: true, isPreset: true, permissions: { select: { module: true, canAccess: true, canCreate: true, canEdit: true, canDelete: true, canRevert: true } } } }, department: { select: { name: true } } },
    });
    if (!user) throw new NotFoundException("المستخدم غير موجود");
    const [activity, totalActions, policiesCreated, approvals, deals, tasks, issuedAudit] = await Promise.all([
      this.prisma.auditLog.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 60, select: { action: true, entity: true, entityId: true, meta: true, createdAt: true } }),
      this.prisma.auditLog.count({ where: { userId: id } }),
      this.prisma.auditLog.count({ where: { userId: id, entity: "policy", action: "create" } }),
      this.prisma.auditLog.count({ where: { userId: id, action: "approve" } }),
      this.prisma.deal.findMany({ where: { assigneeId: id, status: "open" }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, stage: true, status: true, value: true, productLineCode: true, clientId: true, createdAt: true } }),
      this.prisma.crmTask.findMany({ where: { assigneeId: id, status: "open" }, orderBy: { dueDate: "asc" }, select: { id: true, title: true, priority: true, status: true, entityType: true, entityId: true, dueDate: true, createdAt: true } }),
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
    // إثراء النشاط بوصف عربي مقروء وطور ملوّن (لعرضه كخطّ زمني احترافي)
    const activityRich = activity.map((a) => ({ ...a, phase: auditPhase(a.entity), label: describeAudit(a.entity, a.action) }));
    return { user, activity: activityRich, stats: { totalActions, policiesCreated, approvals }, policies, deals: dealsEnriched, tasks };
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

    // نموذج **مسبق الدفع**: لا يتجاوز عدد المستخدمين النشطين المقاعد المرخّصة. لإضافة أكثر ⇒ شراء مقاعد (رفع الرخصة).
    const sub = await this.prisma.subscription.findFirst({ where: { tenantId }, select: { seatsLicensed: true } });
    const licensed = sub?.seatsLicensed ?? 0;
    const activeUsers = await this.prisma.user.count({ where: { tenantId, status: "ACTIVE" } });
    if (activeUsers >= licensed) {
      throw new HttpException(
        { code: "SEAT_LIMIT_REACHED", licensed, activeUsers, message: `بلغت الحدّ الأقصى للمقاعد المرخّصة (${licensed}). اشترِ مقاعد إضافية من صفحة الفوترة لإضافة مستخدمين جدد.` },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

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

    // مزامنة عدّاد المقاعد المستخدمة (للعرض في لوحة المنصّة)
    await this.prisma.subscription.updateMany({ where: { tenantId }, data: { seatsUsed: await this.prisma.user.count({ where: { tenantId, status: "ACTIVE" } }) } });

    return user;
  }

  /**
   * المستخدمون النشطون مقابل **المقاعد المرخّصة** (نموذج مسبق الدفع). `limit` = الرخصة (حدّ أقصى)؛
   * `available` = المقاعد الشاغرة المتاحة للإضافة بلا دفع. لإضافة أكثر من الرخصة ⇒ شراء مقاعد (billing).
   */
  async seats(tenantId: string): Promise<{ used: number; limit: number; available: number; planName: string | null }> {
    const [used, sub] = await Promise.all([
      this.prisma.user.count({ where: { tenantId, status: "ACTIVE" } }),
      this.prisma.subscription.findFirst({ where: { tenantId }, select: { seatsLicensed: true, plan: { select: { name: true } } } }),
    ]);
    const limit = sub?.seatsLicensed ?? used;
    return { used, limit, available: Math.max(0, limit - used), planName: sub?.plan.name ?? null };
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

  /**
   * نطاق المنتجات: يضبط أكواد فروع التأمين المسموحة للموظف (قائمة فارغة = بلا تقييد = كل الفروع).
   * يتحقّق أن الأكواد موجودة فعلاً في الكتالوج قبل الحفظ.
   */
  async setProductScope(admin: AuthUser, id: string, lines: string[]) {
    const target = await this.prisma.user.findFirst({ where: { id }, select: { id: true, email: true } });
    if (!target) throw new NotFoundException("الموظف غير موجود");
    const clean = [...new Set(lines.map((l) => String(l).trim()).filter(Boolean))];
    if (clean.length) {
      const known = await this.prisma.productLine.count({ where: { code: { in: clean } } });
      if (known !== clean.length) throw new BadRequestException("أحد أكواد الفروع غير موجود في الكتالوج");
    }
    await this.prisma.user.update({ where: { id }, data: { allowedProductLines: clean } });
    await this.audit.log({ tenantId: admin.tenantId, userId: admin.userId, action: "update", entity: "user_product_scope", entityId: id, meta: { target: target.email, lines: clean } });
    return { ok: true, allowedProductLines: clean };
  }

  // ————————————————————————— إدارة الأدوار (محرّر RBAC) —————————————————————————

  /** كل الأدوار (المُعدّة + المخصّصة) مع مصفوفة الصلاحيات وعدد المستخدمين — لشاشة إدارة الصلاحيات. */
  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isPreset: "desc" }, { name: "asc" }],
      select: {
        id: true, name: true, isPreset: true,
        permissions: { select: { module: true, canAccess: true, canCreate: true, canEdit: true, canDelete: true, canRevert: true } },
        _count: { select: { users: true, defaultForDepartments: true } },
      },
    });
    return roles.map((r) => ({ id: r.id, name: r.name, isPreset: r.isPreset, permissions: r.permissions, userCount: r._count.users, deptDefaultCount: r._count.defaultForDepartments }));
  }

  /** يضمن صفًّا لكل موديول معروف (يتجاهل المجهول) — يمنع صلاحيات على موديولز غير معرّفة. */
  private sanitizePerms(perms: PermRow[]): Array<{ module: string; canAccess: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; canRevert: boolean }> {
    const byModule = new Map(perms.map((p) => [p.module, p]));
    return (RBAC_MODULES as readonly string[]).map((m) => {
      const p = byModule.get(m);
      return { module: m, canAccess: !!p?.canAccess, canCreate: !!p?.canCreate, canEdit: !!p?.canEdit, canDelete: !!p?.canDelete, canRevert: !!p?.canRevert };
    });
  }

  /** إنشاء دور مخصّص (غير مُعدّ مسبقًا) من مصفوفة الصلاحيات. */
  async createRole(admin: AuthUser, name: string, perms: PermRow[]) {
    const nm = name.trim();
    const dup = await this.prisma.role.findFirst({ where: { name: nm }, select: { id: true } });
    if (dup) throw new ConflictException("اسم الدور مستخدم مسبقاً");
    const role = await this.prisma.role.create({
      data: { tenantId: admin.tenantId, name: nm, isPreset: false, permissions: { create: this.sanitizePerms(perms) } },
      select: { id: true, name: true, isPreset: true },
    });
    await this.audit.log({ tenantId: admin.tenantId, userId: admin.userId, action: "create", entity: "role", entityId: role.id, meta: { name: nm } });
    return role;
  }

  /** تعديل دور: الاسم و/أو مصفوفة الصلاحيات — مع منع القفل الذاتي عن إدارة الإعدادات. */
  async updateRole(admin: AuthUser, id: string, data: { name?: string; permissions?: PermRow[] }) {
    const role = await this.prisma.role.findFirst({ where: { id }, select: { id: true, name: true } });
    if (!role) throw new NotFoundException("الدور غير موجود");
    // حاجز القفل الذاتي: لا يُزيل الأدمن صلاحية إدارة الإعدادات عن دوره هو (وإلا فقد الوصول للإدارة)
    if (data.permissions && id === admin.roleId) {
      const s = data.permissions.find((p) => p.module === "settings");
      if (!s?.canAccess || !s?.canEdit) throw new BadRequestException("لا يمكنك إزالة صلاحية إدارة الإعدادات عن دورك الحالي");
    }
    await this.prisma.$transaction(async (tx) => {
      if (data.name && data.name.trim() !== role.name) {
        const nm = data.name.trim();
        const dup = await tx.role.findFirst({ where: { name: nm, id: { not: id } }, select: { id: true } });
        if (dup) throw new ConflictException("اسم الدور مستخدم مسبقاً");
        await tx.role.update({ where: { id }, data: { name: nm } });
      }
      if (data.permissions) {
        for (const r of this.sanitizePerms(data.permissions)) {
          await tx.permission.upsert({
            where: { roleId_module: { roleId: id, module: r.module } },
            update: { canAccess: r.canAccess, canCreate: r.canCreate, canEdit: r.canEdit, canDelete: r.canDelete, canRevert: r.canRevert },
            create: { roleId: id, ...r },
          });
        }
      }
    });
    await this.audit.log({ tenantId: admin.tenantId, userId: admin.userId, action: "update", entity: "role", entityId: id, meta: { name: data.name ?? role.name } });
    return { ok: true };
  }

  /** حذف دور مخصّص غير مُستخدَم (يُمنع حذف المُعدّ مسبقًا أو المُسند لمستخدمين/أقسام). */
  async deleteRole(admin: AuthUser, id: string) {
    const role = await this.prisma.role.findFirst({ where: { id }, select: { id: true, name: true, isPreset: true, _count: { select: { users: true, defaultForDepartments: true } } } });
    if (!role) throw new NotFoundException("الدور غير موجود");
    if (role.isPreset) throw new ConflictException("لا يمكن حذف دور مُعدّ مسبقًا");
    if (role._count.users > 0) throw new ConflictException("الدور مُسند لمستخدمين — أعد إسنادهم أولاً");
    if (role._count.defaultForDepartments > 0) throw new ConflictException("الدور افتراضي لقسم — غيّره أولاً");
    await this.prisma.$transaction(async (tx) => {
      await tx.permission.deleteMany({ where: { roleId: id } });
      await tx.role.delete({ where: { id } });
    });
    await this.audit.log({ tenantId: admin.tenantId, userId: admin.userId, action: "delete", entity: "role", entityId: id, meta: { name: role.name } });
    return { ok: true };
  }

  /** إسناد دور لمستخدم — مع منع الأدمن من إسناد دور بلا إدارة إعدادات لنفسه. */
  async assignRole(admin: AuthUser, userId: string, roleId: string) {
    const [user, role] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: userId }, select: { id: true, email: true } }),
      this.prisma.role.findFirst({ where: { id: roleId }, select: { id: true, name: true, permissions: { where: { module: "settings" }, select: { canAccess: true, canEdit: true } } } }),
    ]);
    if (!user) throw new NotFoundException("المستخدم غير موجود");
    if (!role) throw new NotFoundException("الدور غير موجود");
    if (userId === admin.userId) {
      const s = role.permissions[0];
      if (!s?.canAccess || !s?.canEdit) throw new BadRequestException("لا يمكنك إسناد دور لنفسك بلا صلاحية إدارة الإعدادات");
    }
    await this.prisma.user.update({ where: { id: userId }, data: { roleId } });
    await this.audit.log({ tenantId: admin.tenantId, userId: admin.userId, action: "update", entity: "user_role", entityId: userId, meta: { target: user.email, role: role.name } });
    return { ok: true, roleId };
  }

  /** ضبط نسبة عمولة/حافز الموظف (% من عمولة الوساطة) — null = بلا عمولة. */
  async setCommissionRate(admin: AuthUser, id: string, rate: number | null) {
    const target = await this.prisma.user.findFirst({ where: { id }, select: { id: true, email: true } });
    if (!target) throw new NotFoundException("الموظف غير موجود");
    if (rate != null && (rate < 0 || rate > 100)) throw new BadRequestException("النسبة يجب أن تكون بين 0 و100");
    await this.prisma.user.update({ where: { id }, data: { commissionRate: rate } });
    await this.audit.log({ tenantId: admin.tenantId, userId: admin.userId, action: "update", entity: "user_commission_rate", entityId: id, meta: { target: target.email, rate } });
    return { ok: true, commissionRate: rate };
  }
}
