import { Module } from "@nestjs/common";
import { ServiceController } from "./service.controller";
import { ServiceService } from "./service.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [NotificationsModule, EmailModule],
  controllers: [ServiceController],
  providers: [ServiceService],
})
export class ServiceModule {}
