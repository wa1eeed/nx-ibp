import { Module } from "@nestjs/common";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";
import { PlatformGuard } from "./platform.guard";
import { PlatformPaymentSettingsService } from "./platform-payment-settings.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuditViewModule } from "../audit/audit.module";
import { VerificationModule } from "../verification/verification.module";

@Module({
  imports: [NotificationsModule, AuditViewModule, VerificationModule], // إشعارات + عرض التدقيق + سجلّ السجل التجاري (استيراد السوبر أدمن)
  controllers: [PlatformController],
  providers: [PlatformService, PlatformGuard, PlatformPaymentSettingsService],
  exports: [PlatformPaymentSettingsService], // تستخدمه فوترة الاشتراكات (billing) للمفتاح الفعّال
})
export class PlatformModule {}
