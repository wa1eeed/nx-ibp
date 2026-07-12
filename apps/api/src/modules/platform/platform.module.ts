import { Module } from "@nestjs/common";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";
import { PlatformGuard } from "./platform.guard";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuditViewModule } from "../audit/audit.module";

@Module({
  imports: [NotificationsModule, AuditViewModule], // إشعارات المنصة الافتراضية + عرض التدقيق بالأسماء
  controllers: [PlatformController],
  providers: [PlatformService, PlatformGuard],
})
export class PlatformModule {}
