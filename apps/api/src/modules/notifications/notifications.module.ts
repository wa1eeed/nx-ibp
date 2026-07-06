import { Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { NOTIFICATION_GATEWAY, SandboxNotificationGateway, LiveNotificationGateway } from "./notification.gateway";
import { EmailModule } from "../email/email.module";

/**
 * نظام الإشعارات (المرحلة H) — إعدادات لكل نوع/قناة (Email/SMS) بمستويين
 * (منصّة/شركة) + بوّابة إرسال قابلة للتبديل: NOTIFY_GATEWAY=live ⇒ Taqnyat(SMS)
 * + Resend(Email)؛ غير ذلك Sandbox. NotificationsService مُصدَّر للوحة والموديولز.
 */
@Module({
  imports: [EmailModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NOTIFICATION_GATEWAY, useFactory: () => (process.env.NOTIFY_GATEWAY === "live" ? new LiveNotificationGateway() : new SandboxNotificationGateway()) },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
