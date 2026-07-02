import { Module } from "@nestjs/common";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";
import { PlatformGuard } from "./platform.guard";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule], // لإدارة إشعارات المنصة الافتراضية
  controllers: [PlatformController],
  providers: [PlatformService, PlatformGuard],
})
export class PlatformModule {}
