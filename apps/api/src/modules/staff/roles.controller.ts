import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { StaffService } from "./staff.service";
import { CreateRoleDto, UpdateRoleDto } from "./dto/role.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";

/**
 * إدارة الأدوار والصلاحيات (محرّر RBAC) — محصورة بموديول "settings".
 * القراءة/الإنشاء/التعديل/الحذف تُطابق أفعال RBAC (read/create/update/delete).
 */
@Controller("roles")
export class RolesController {
  constructor(private readonly staff: StaffService) {}

  @Authorize({ module: "settings", action: "read" })
  @Get()
  list() {
    return this.staff.listRoles();
  }

  @Authorize({ module: "settings", action: "create" })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto) {
    return this.staff.createRole(user, dto.name, dto.permissions);
  }

  @Authorize({ module: "settings", action: "update" })
  @Put(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateRoleDto) {
    return this.staff.updateRole(user, id, dto);
  }

  @Authorize({ module: "settings", action: "delete" })
  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.staff.deleteRole(user, id);
  }
}
