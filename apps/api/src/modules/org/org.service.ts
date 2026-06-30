import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import type { AssignUserDto, CreateDepartmentDto, UpdateDepartmentDto } from "./dto/department.dto";

interface DeptNode {
  id: string;
  name: string;
  parentId: string | null;
  defaultRole: { id: string; name: string } | null;
  memberCount: number;
  children: DeptNode[];
}

/**
 * الهيكل الإداري (المرحلة C1) — أقسام هرمية معزولة بالمستأجر. كل الاستعلامات
 * تُفلتر تلقائيًا بـ tenantId (Prisma middleware) فالعزل مضمون. القسم قد يحمل
 * دورًا افتراضيًا يُطبَّق على من يُسند إليه ما لم يُمرَّر دور صريح.
 */
@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** يتحقّق أن القسم يخصّ المستأجر (الفلترة تلقائية) ويعيده، وإلا 404. */
  private async mustExist(id: string) {
    const dep = await this.prisma.department.findFirst({ where: { id }, select: { id: true, parentId: true } });
    if (!dep) throw new NotFoundException("القسم غير موجود");
    return dep;
  }

  async create(tenantId: string, userId: string, dto: CreateDepartmentDto) {
    if (dto.parentId) await this.mustExist(dto.parentId);
    if (dto.defaultRoleId) await this.assertRole(dto.defaultRoleId);
    const dep = await this.prisma.department.create({
      data: { tenantId, name: dto.name, parentId: dto.parentId ?? null, defaultRoleId: dto.defaultRoleId ?? null },
      select: { id: true, name: true, parentId: true, defaultRoleId: true },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "department", entityId: dep.id, meta: { name: dep.name } });
    return dep;
  }

  private async assertRole(roleId: string) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId }, select: { id: true } });
    if (!role) throw new BadRequestException("الدور غير موجود");
  }

  /** شجرة الأقسام مع عدد الأعضاء واسم الدور الافتراضي. */
  async tree(): Promise<DeptNode[]> {
    const deps = await this.prisma.department.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, parentId: true, defaultRole: { select: { id: true, name: true } }, _count: { select: { members: true } } },
    });
    const nodes = new Map<string, DeptNode>();
    deps.forEach((d) => nodes.set(d.id, { id: d.id, name: d.name, parentId: d.parentId, defaultRole: d.defaultRole, memberCount: d._count.members, children: [] }));
    const roots: DeptNode[] = [];
    nodes.forEach((n) => {
      if (n.parentId && nodes.has(n.parentId)) nodes.get(n.parentId)!.children.push(n);
      else roots.push(n);
    });
    return roots;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateDepartmentDto) {
    await this.mustExist(id);
    if (dto.parentId) {
      if (dto.parentId === id) throw new BadRequestException("لا يكون القسم أبًا لنفسه");
      await this.mustExist(dto.parentId);
      await this.assertNoCycle(id, dto.parentId);
    }
    if (dto.defaultRoleId) await this.assertRole(dto.defaultRoleId);
    const dep = await this.prisma.department.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        ...(dto.defaultRoleId !== undefined ? { defaultRoleId: dto.defaultRoleId } : {}),
      },
      select: { id: true, name: true, parentId: true, defaultRoleId: true },
    });
    await this.audit.log({ tenantId, userId, action: "update", entity: "department", entityId: id, meta: {} });
    return dep;
  }

  /** يمنع الدورات: لا يكون الأب المقترح من نسل القسم نفسه. */
  private async assertNoCycle(id: string, newParentId: string) {
    let cursor: string | null = newParentId;
    const guard = new Set<string>();
    while (cursor) {
      if (cursor === id) throw new BadRequestException("نقل القسم يُنشئ دورة في الهيكل");
      if (guard.has(cursor)) break;
      guard.add(cursor);
      const parent: { parentId: string | null } | null = await this.prisma.department.findFirst({ where: { id: cursor }, select: { parentId: true } });
      cursor = parent?.parentId ?? null;
    }
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.mustExist(id);
    // الأعضاء والأبناء يُفصلون تلقائيًا (FK SET NULL) — القسم تنظيمي لا يحمل بيانات حرجة.
    await this.prisma.department.delete({ where: { id } });
    await this.audit.log({ tenantId, userId, action: "delete", entity: "department", entityId: id, meta: {} });
    return { ok: true };
  }

  /** يُسند موظفًا لقسم؛ يطبّق دور القسم الافتراضي ما لم يُمرَّر دور صريح. */
  async assignUser(tenantId: string, actorId: string, dto: AssignUserDto) {
    const dep = await this.prisma.department.findFirst({ where: { id: dto.departmentId }, select: { id: true, defaultRoleId: true } });
    if (!dep) throw new NotFoundException("القسم غير موجود");
    const user = await this.prisma.user.findFirst({ where: { id: dto.userId }, select: { id: true } });
    if (!user) throw new NotFoundException("الموظف غير موجود");
    if (dto.roleId) await this.assertRole(dto.roleId);

    const effectiveRole = dto.roleId ?? dep.defaultRoleId ?? undefined;
    const updated = await this.prisma.user.update({
      where: { id: dto.userId },
      data: { departmentId: dep.id, ...(effectiveRole ? { roleId: effectiveRole } : {}) },
      select: { id: true, fullName: true, departmentId: true, roleId: true },
    });
    await this.audit.log({ tenantId, userId: actorId, action: "update", entity: "user_department", entityId: dto.userId, meta: { departmentId: dep.id, roleApplied: effectiveRole ?? null } });
    return updated;
  }

  /** أدوار المستأجر (لقوائم اختيار الدور الافتراضي/الإسناد). */
  roles() {
    return this.prisma.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, isPreset: true } });
  }

  /** أعضاء قسم (للعرض في صفحة الهيكل). */
  members(departmentId: string) {
    return this.prisma.user.findMany({
      where: { departmentId },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, email: true, role: { select: { name: true } } },
    });
  }
}
