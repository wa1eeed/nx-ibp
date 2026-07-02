import { Module } from "@nestjs/common";
import { ClaimsController } from "./claims.controller";
import { ClaimsService } from "./claims.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [ClaimsController],
  providers: [ClaimsService],
})
export class ClaimsModule {}
