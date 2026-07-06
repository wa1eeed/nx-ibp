import { Module } from "@nestjs/common";
import { PortalController } from "./portal.controller";
import { PortalService } from "./portal.service";
import { PortalGuard } from "./portal.guard";
import { NotificationsModule } from "../notifications/notifications.module";
import { ConfigModule } from "../config/config.module";

@Module({
  imports: [NotificationsModule, ConfigModule],
  controllers: [PortalController],
  providers: [PortalService, PortalGuard],
})
export class PortalModule {}
