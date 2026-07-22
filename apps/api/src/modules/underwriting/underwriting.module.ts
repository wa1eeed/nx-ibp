import { Module } from "@nestjs/common";
import { SlipsController } from "./slips.controller";
import { SlipsService } from "./slips.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [NotificationsModule, EmailModule],
  controllers: [SlipsController],
  providers: [SlipsService],
})
export class UnderwritingModule {}
