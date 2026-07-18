import { Module } from "@nestjs/common";
import { PortalController } from "./portal.controller";
import { PortalAdminController } from "./portal-admin.controller";
import { PortalService } from "./portal.service";
import { PortalGuard } from "./portal.guard";
import { NotificationsModule } from "../notifications/notifications.module";
import { ConfigModule } from "../config/config.module";
import { PaymentsModule } from "../payments/payments.module";
import { CoverNotesModule } from "../cover-notes/cover-notes.module";

@Module({
  imports: [NotificationsModule, ConfigModule, PaymentsModule, CoverNotesModule],
  controllers: [PortalController, PortalAdminController],
  providers: [PortalService, PortalGuard],
})
export class PortalModule {}
