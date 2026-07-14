import { Body, Controller, Get, Put } from "@nestjs/common";
import { PaymentSettingsService } from "./payment-settings.service";
import { SavePaymentSettingsDto } from "./dto/payment-settings.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/** إعدادات بوّابة الدفع للمستأجر (BYO Tap/Moyasar) — تحت الإعدادات. */
@Controller("config/payment")
export class PaymentSettingsController {
  constructor(private readonly payments: PaymentSettingsService) {}

  @Authorize({ module: "settings", action: "read" })
  @Get()
  get(@CurrentUser("tenantId") tenantId: string) {
    return this.payments.get(tenantId);
  }

  @Authorize({ module: "settings", action: "update" })
  @Put()
  save(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Body() dto: SavePaymentSettingsDto,
  ) {
    return this.payments.save(tenantId, userId, dto);
  }
}
