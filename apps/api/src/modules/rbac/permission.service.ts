import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ACTION_FLAG, type RbacModule, type RbacAction } from "./rbac.constants";

/**
 * فحص RBAC: هل لدور المستخدم صلاحية الفعل على الموديول؟
 * يُحمَّل الدور ضمن نطاق المستأجر (Prisma middleware) فلا يُقرأ دور مستأجر آخر.
 */
@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async can(roleId: string | null, module: RbacModule, action: RbacAction): Promise<boolean> {
    if (!roleId) return false;
    const role = await this.prisma.role.findFirst({
      where: { id: roleId },
      include: { permissions: { where: { module } } },
    });
    const perm = role?.permissions[0];
    return perm ? perm[ACTION_FLAG[action]] === true : false;
  }
}
