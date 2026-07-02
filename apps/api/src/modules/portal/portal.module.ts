import { Module } from "@nestjs/common";
import { PortalController } from "./portal.controller";
import { PortalService } from "./portal.service";
import { PortalGuard } from "./portal.guard";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [PortalController],
  providers: [PortalService, PortalGuard],
})
export class PortalModule {}
