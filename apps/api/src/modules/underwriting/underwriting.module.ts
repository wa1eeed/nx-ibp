import { Module } from "@nestjs/common";
import { SlipsController } from "./slips.controller";
import { SlipsService } from "./slips.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { EmailModule } from "../email/email.module";
import { ConfigModule } from "../config/config.module";

@Module({
  imports: [NotificationsModule, EmailModule, ConfigModule],
  controllers: [SlipsController],
  providers: [SlipsService],
})
export class UnderwritingModule {}
