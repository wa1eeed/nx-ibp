import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { FinanceService } from "./finance.service";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/**
 * المالية (المرحلة 4ب) — موديول finance. الأدوار: المحاسب/مدير مالي، المدير العام.
 */
@Controller("finance")
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  // الاعتماد المالي ⇒ يولّد القيد والإشعار والفاتورة آلياً
  @Authorize({ module: "finance", action: "update", entitlement: "module.finance" })
  @HttpCode(200)
  @Post("policies/:id/approve")
  approve(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
  ) {
    return this.finance.approvePolicy(tenantId, userId, id);
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("vouchers")
  vouchers() {
    return this.finance.listVouchers();
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("policies/:id/postings")
  postings(@Param("id") id: string) {
    return this.finance.postings(id);
  }
}
