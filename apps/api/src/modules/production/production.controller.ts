import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ProductionService } from "./production.service";
import { IssuePolicyDto } from "./dto/issue-policy.dto";
import { ApproveStepDto } from "./dto/approve-step.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";

@Controller("policies")
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Authorize({ module: "production", action: "read", entitlement: "module.production" })
  @Get()
  list() {
    return this.production.list();
  }

  @Authorize({ module: "production", action: "create", entitlement: "module.production" })
  @Post("issue")
  issue(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Body() dto: IssuePolicyDto,
  ) {
    return this.production.issuePolicy(tenantId, userId, dto);
  }

  // الموافقة الفنية (Underwriter)
  @Authorize({ module: "production", action: "update", entitlement: "module.production" })
  @HttpCode(200)
  @Post(":id/approve-technical")
  approveTechnical(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
  ) {
    return this.production.approveTechnical(tenantId, userId, id);
  }

  // E2 — الموافقة على خطوة اعتماد إضافية مُهيّأة (الصلاحية ديناميكية حسب الخطوة ⇒ تُفحَص داخل الخدمة)
  @HttpCode(200)
  @Post(":id/approve-step")
  approveStep(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: ApproveStepDto,
  ) {
    return this.production.approveStep(user.tenantId, user, id, dto.stepKey);
  }

  // نظرة 360° للوثيقة (مالية/ملاحق/مطالبات/فواتير/مستندات/خط زمني)
  @Authorize({ module: "production", action: "read", entitlement: "module.production" })
  @Get(":id/overview")
  overview(@Param("id") id: string) {
    return this.production.overview(id);
  }

  @Authorize({ module: "production", action: "read", entitlement: "module.production" })
  @Get(":id")
  getOne(@Param("id") id: string) {
    return this.production.getOne(id);
  }
}
