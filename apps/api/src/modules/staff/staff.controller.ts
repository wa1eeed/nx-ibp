import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { StaffService } from "./staff.service";
import { CreateStaffDto } from "./dto/create-staff.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/**
 * إدارة الموظفين — محصورة بصلاحية موديول "settings" (الأدمن فقط في القوالب).
 */
@Controller("staff")
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Authorize({ module: "settings", action: "read" })
  @Get()
  list() {
    return this.staff.list();
  }

  @Authorize({ module: "settings", action: "read" })
  @Get("roles")
  roles() {
    return this.staff.roleTemplates();
  }

  // تفاصيل موظف 360° (بياناته/دوره/قسمه + نشاطه ومؤشراته)
  @Authorize({ module: "settings", action: "read" })
  @Get(":id")
  detail(@Param("id") id: string) {
    return this.staff.detail(id);
  }

  @Authorize({ module: "settings", action: "create" })
  @Post()
  create(@CurrentUser("tenantId") tenantId: string, @Body() dto: CreateStaffDto) {
    return this.staff.create(tenantId, dto);
  }
}
