import { Module } from "@nestjs/common";
import { PaymentSettingsController } from "./payment-settings.controller";
import { PaymentSettingsService } from "./payment-settings.service";

/**
 * المدفوعات (§2.2): إعدادات بوّابة الدفع للمستأجر (BYO Tap/Moyasar) — الأساس الذي
 * يبني عليه دفع العميل للأقساط (اللبنة ب) واشتراكات المنصّة (اللبنة ج).
 * يُصدَّر الخدمة لتستخدمها البوّابة في إنشاء عمليات الدفع لاحقًا.
 */
@Module({
  controllers: [PaymentSettingsController],
  providers: [PaymentSettingsService],
  exports: [PaymentSettingsService],
})
export class PaymentsModule {}
