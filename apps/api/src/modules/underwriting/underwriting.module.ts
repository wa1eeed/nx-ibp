import { Module } from "@nestjs/common";
import { SlipsController } from "./slips.controller";
import { SlipsService } from "./slips.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [SlipsController],
  providers: [SlipsService],
})
export class UnderwritingModule {}
