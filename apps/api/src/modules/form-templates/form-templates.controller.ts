import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { FormTemplatesService } from "./form-templates.service";
import { CreateFormTemplateDto, UpdateFormTemplateDto } from "./dto/form-template.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/** مكتبة قوالب النماذج — تحت وحدة المبيعات (نفس نطاق إنشاء الطلبات). */
@Controller("form-templates")
export class FormTemplatesController {
  constructor(private readonly templates: FormTemplatesService) {}

  @Authorize({ module: "sales", action: "read", entitlement: "module.sales" })
  @Get()
  list(@Query("line") line?: string) {
    return this.templates.list(line);
  }

  @Authorize({ module: "sales", action: "read", entitlement: "module.sales" })
  @Get(":id")
  get(@Param("id") id: string) {
    return this.templates.get(id);
  }

  @Authorize({ module: "sales", action: "create", entitlement: "module.sales" })
  @Post()
  create(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: CreateFormTemplateDto) {
    return this.templates.create(tenantId, userId, dto);
  }

  @Authorize({ module: "sales", action: "update", entitlement: "module.sales" })
  @Patch(":id")
  update(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: UpdateFormTemplateDto) {
    return this.templates.update(tenantId, userId, id, dto);
  }

  @Authorize({ module: "sales", action: "delete", entitlement: "module.sales" })
  @Delete(":id")
  remove(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string) {
    return this.templates.remove(tenantId, userId, id);
  }

  // تطبيق القالب (قراءة + زيادة عدّاد الاستخدام)
  @Authorize({ module: "sales", action: "read", entitlement: "module.sales" })
  @Post(":id/apply")
  apply(@Param("id") id: string) {
    return this.templates.apply(id);
  }
}
