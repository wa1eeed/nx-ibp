import { Module } from "@nestjs/common";
import { PaymentSettingsController } from "./payment-settings.controller";
import { PaymentSettingsService } from "./payment-settings.service";
import { PaymentChargeService } from "./payment-charge.service";
import { PaymentsWebhookController } from "./payments-webhook.controller";
import { FinanceModule } from "../finance/finance.module";

/**
 * المدفوعات (§2.2): إعدادات بوّابة الدفع للمستأجر (BYO Tap/Moyasar) + **دفع العميل**
 * للأقساط/الذمم عبر البوّابة (شحنة ⇒ عودة/webhook ⇒ سند قبض تلقائي). واشتراكات المنصّة في `billing`.
 */
@Module({
  imports: [FinanceModule],
  controllers: [PaymentSettingsController, PaymentsWebhookController],
  providers: [PaymentSettingsService, PaymentChargeService],
  exports: [PaymentSettingsService, PaymentChargeService],
})
export class PaymentsModule {}
