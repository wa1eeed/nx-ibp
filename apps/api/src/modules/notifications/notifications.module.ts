import { Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { NOTIFICATION_GATEWAY, SandboxNotificationGateway } from "./notification.gateway";

/**
 * نظام الإشعارات (المرحلة H) — إعدادات لكل نوع/قناة (Email/SMS) بمستويين
 * (منصّة/شركة) + بوّابة إرسال قابلة للتبديل. NotificationsService مُصدَّر
 * لتستهلكه لوحة المنصة والموديولز عند الأحداث.
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NOTIFICATION_GATEWAY, useClass: SandboxNotificationGateway },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
