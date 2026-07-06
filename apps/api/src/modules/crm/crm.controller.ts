import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CrmService } from "./crm.service";
import { CreateDealDto, UpdateDealDto, CreateTaskDto, AddActivityDto } from "./dto/crm.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";

/** إدارة علاقات العملاء (CRM) — تحت وحدة المبيعات. */
@Controller("crm")
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  // ——— لوحة المتابعة (عابرة للوحدات، تحترم الصلاحيات) ———
  @Authorize({ module: "sales", action: "read", entitlement: "feature.crm" })
  @Get("follow-up")
  followUp(@CurrentUser() user: AuthUser) {
    return this.crm.followUp(user);
  }

  // ——— الصفقات (Pipeline) ———
  @Authorize({ module: "sales", action: "read", entitlement: "feature.crm" })
  @Get("deals")
  deals(@CurrentUser() user: AuthUser) {
    return this.crm.listDeals(user);
  }

  @Authorize({ module: "sales", action: "read", entitlement: "feature.crm" })
  @Get("deals/:id")
  getDeal(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.crm.getDeal(user, id);
  }

  @Authorize({ module: "sales", action: "create", entitlement: "feature.crm" })
  @Post("deals")
  createDeal(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: CreateDealDto) {
    return this.crm.createDeal(tenantId, userId, dto);
  }

  @Authorize({ module: "sales", action: "update", entitlement: "feature.crm" })
  @Patch("deals/:id")
  updateDeal(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateDealDto) {
    return this.crm.updateDeal(user, id, dto);
  }

  // تحويل الفرصة إلى طلب تأمين (المبيعات ⇒ الاكتتاب)
  @Authorize({ module: "sales", action: "update", entitlement: "feature.crm" })
  @Post("deals/:id/convert")
  convertDeal(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.crm.convertDeal(user, id);
  }

  // ——— المهام/التذكيرات ———
  @Authorize({ module: "sales", action: "read", entitlement: "feature.crm" })
  @Get("tasks")
  tasks(@CurrentUser() user: AuthUser, @Query("mine") mine?: string) {
    return this.crm.listTasks(user, !!mine);
  }

  @Authorize({ module: "sales", action: "create", entitlement: "feature.crm" })
  @Post("tasks")
  createTask(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: CreateTaskDto) {
    return this.crm.createTask(tenantId, userId, dto);
  }

  @Authorize({ module: "sales", action: "update", entitlement: "feature.crm" })
  @Post("tasks/:id/complete")
  completeTask(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.crm.completeTask(user, id);
  }

  // ——— النشاط/الملاحظات (Timeline) ———
  @Authorize({ module: "sales", action: "read", entitlement: "feature.crm" })
  @Get("activities/:entityType/:entityId")
  activities(@Param("entityType") entityType: string, @Param("entityId") entityId: string) {
    return this.crm.listActivities(entityType, entityId);
  }

  @Authorize({ module: "sales", action: "create", entitlement: "feature.crm" })
  @Post("activities")
  addActivity(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: AddActivityDto) {
    return this.crm.addActivity(tenantId, userId, dto);
  }
}
