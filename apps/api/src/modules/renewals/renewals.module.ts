import { Module } from "@nestjs/common";
import { RenewalsController } from "./renewals.controller";
import { RenewalsService } from "./renewals.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [RenewalsController],
  providers: [RenewalsService],
})
export class RenewalsModule {}
