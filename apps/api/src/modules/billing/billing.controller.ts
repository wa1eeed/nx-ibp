import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { BillingService } from "./billing.service";
import { CheckoutDto } from "./dto/checkout.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { Public } from "../auth/public.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** بدء دفع اشتراك — يعيد رابط صفحة الدفع. (إدارة المستأجر: settings) */
  @Authorize({ module: "settings", action: "update" })
  @Post("checkout")
  checkout(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: CheckoutDto) {
    return this.billing.checkout(tenantId, userId, dto);
  }

  /** مطابقة حالة الدفع بعد عودة العميل (idempotent). */
  @Authorize({ module: "settings", action: "read" })
  @Post(":id/confirm")
  confirm(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string) {
    return this.billing.confirm(tenantId, userId, id);
  }

  /** إشعار البوّابة (server-to-server) — عام، موقّع بـ hashstring. */
  @Public()
  @Post("webhook")
  webhook(@Headers() headers: Record<string, string | undefined>, @Body() body: Record<string, unknown>) {
    return this.billing.handleWebhook(headers, body);
  }

  @Authorize({ module: "settings", action: "read" })
  @Get("plans")
  plans() {
    return this.billing.plans();
  }

  @Authorize({ module: "settings", action: "read" })
  @Get("invoices")
  invoices(@CurrentUser("tenantId") tenantId: string) {
    return this.billing.invoices(tenantId);
  }

  @Authorize({ module: "settings", action: "read" })
  @Get("subscription")
  subscription(@CurrentUser("tenantId") tenantId: string) {
    return this.billing.subscription(tenantId);
  }
}
