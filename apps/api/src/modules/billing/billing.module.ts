import { Module } from "@nestjs/common";
import { BillingService } from "./billing.service";
import { BillingController } from "./billing.controller";
import { PAYMENT_GATEWAY } from "./gateway/gateway.types";
import { TapGateway } from "./gateway/tap.gateway";
import { SandboxGateway } from "./gateway/sandbox.gateway";
import { NotificationsModule } from "../notifications/notifications.module";
import { PlatformModule } from "../platform/platform.module";

/**
 * فوترة الاشتراكات (المرحلة B2). بوّابة الدفع تُختار من BILLING_GATEWAY
 * (sandbox للتطوير/الاختبار · tap للإنتاج) — نقطة تبديل واحدة.
 */
@Module({
  imports: [NotificationsModule, PlatformModule], // PlatformModule يوفّر مفتاح Tap الفعّال للمنصّة
  controllers: [BillingController],
  providers: [
    BillingService,
    {
      provide: PAYMENT_GATEWAY,
      useFactory: () => (process.env.BILLING_GATEWAY === "tap" ? new TapGateway() : new SandboxGateway()),
    },
  ],
})
export class BillingModule {}
