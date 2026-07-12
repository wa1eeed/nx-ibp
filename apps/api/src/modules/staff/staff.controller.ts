import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { IsArray, IsString } from "class-validator";
import { StaffService } from "./staff.service";
import { CreateStaffDto } from "./dto/create-staff.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";

class ProductScopeDto {
  @IsArray() @IsString({ each: true }) lines!: string[];
}

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

  // استخدام المقاعد وفق الباقة (المستخدَم/الحدّ) — لعرضه في صفحة الموظفين
  @Authorize({ module: "settings", action: "read" })
  @Get("seats")
  seats(@CurrentUser("tenantId") tenantId: string) {
    return this.staff.seats(tenantId);
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

  // إعادة تعيين المصادقة الثنائية لموظف (تعطيلها) — لأدمن الشركة عند فقدان الجهاز
  @Authorize({ module: "settings", action: "update" })
  @HttpCode(200)
  @Post(":id/mfa/reset")
  resetMfa(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.staff.resetMfa(user, id);
  }

  // نطاق المنتجات: يحصر رؤية/إنشاء الموظف بفروع تأمين محدّدة (فارغ = كل الفروع)
  @Authorize({ module: "settings", action: "update" })
  @HttpCode(200)
  @Post(":id/product-scope")
  setProductScope(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: ProductScopeDto) {
    return this.staff.setProductScope(user, id, dto.lines);
  }
}
