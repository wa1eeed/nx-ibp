import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { OrgService } from "./org.service";
import { AssignUserDto, CreateDepartmentDto, UpdateDepartmentDto } from "./dto/department.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/** الهيكل الإداري والأقسام (C1) — تحت إعدادات إدارة المستأجر. */
@Controller("org/departments")
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Authorize({ module: "settings", action: "read" })
  @Get()
  tree() {
    return this.org.tree();
  }

  @Authorize({ module: "settings", action: "read" })
  @Get("roles")
  roles() {
    return this.org.roles();
  }

  @Authorize({ module: "settings", action: "read" })
  @Get(":id/members")
  members(@Param("id") id: string) {
    return this.org.members(id);
  }

  @Authorize({ module: "settings", action: "create" })
  @Post()
  create(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: CreateDepartmentDto) {
    return this.org.create(tenantId, userId, dto);
  }

  @Authorize({ module: "settings", action: "update" })
  @Post("assign")
  assign(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: AssignUserDto) {
    return this.org.assignUser(tenantId, userId, dto);
  }

  @Authorize({ module: "settings", action: "update" })
  @Patch(":id")
  update(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: UpdateDepartmentDto) {
    return this.org.update(tenantId, userId, id, dto);
  }

  @Authorize({ module: "settings", action: "delete" })
  @Delete(":id")
  remove(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string) {
    return this.org.remove(tenantId, userId, id);
  }
}
