import { Controller, Post } from "@nestjs/common";
import { RemindersService } from "./reminders.service";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/**
 * تشغيل مسح التذكيرات يدويًا — مقصورًا على مستأجر المُستدعي (لا يعبر الشركات).
 * صلاحية إشرافية (تعديل المبيعات = مدير CRM) لتفادي إطلاق تذكيرات جماعية دون تخويل.
 */
@Controller("reminders")
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Authorize({ module: "sales", action: "update", entitlement: "module.sales" })
  @Post("run")
  run(@CurrentUser("tenantId") tenantId: string) {
    return this.reminders.sweep(new Date(), tenantId);
  }
}
