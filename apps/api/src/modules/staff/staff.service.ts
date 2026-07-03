import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
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

  /** تفاصيل موظف 360° — بياناته + دوره + قسمه + نشاطه (من سجل التدقيق) + مؤشرات. */
  async detail(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id },
      select: { id: true, fullName: true, email: true, status: true, createdAt: true, role: { select: { name: true, isPreset: true } }, department: { select: { name: true } } },
    });
    if (!user) throw new NotFoundException("المستخدم غير موجود");
    const [activity, totalActions, policiesCreated, approvals] = await Promise.all([
      this.prisma.auditLog.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 60, select: { action: true, entity: true, entityId: true, meta: true, createdAt: true } }),
      this.prisma.auditLog.count({ where: { userId: id } }),
      this.prisma.auditLog.count({ where: { userId: id, entity: "policy", action: "create" } }),
      this.prisma.auditLog.count({ where: { userId: id, action: "approve" } }),
    ]);
    return { user, activity, stats: { totalActions, policiesCreated, approvals } };
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
}
