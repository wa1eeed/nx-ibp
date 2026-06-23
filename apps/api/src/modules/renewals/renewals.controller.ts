import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { RenewalsService } from "./renewals.service";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

@Controller("renewals")
export class RenewalsController {
  constructor(private readonly renewals: RenewalsService) {}

  @Authorize({ module: "production", action: "read", entitlement: "module.production" })
  @Get()
  due(@Query("days") days?: string) {
    const n = days ? Number(days) : 60;
    return this.renewals.due(Number.isFinite(n) ? n : 60);
  }

  @Authorize({ module: "production", action: "create", entitlement: "module.production" })
  @HttpCode(200)
  @Post(":policyId/initiate")
  initiate(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("policyId") policyId: string,
  ) {
    return this.renewals.initiate(tenantId, userId, policyId);
  }
}
