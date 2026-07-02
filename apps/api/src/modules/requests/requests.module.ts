import { Module } from "@nestjs/common";
import { RequestsController } from "./requests.controller";
import { RequestsService } from "./requests.service";
import { FormValidationService } from "./form-validation.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [RequestsController],
  providers: [RequestsService, FormValidationService],
})
export class RequestsModule {}
