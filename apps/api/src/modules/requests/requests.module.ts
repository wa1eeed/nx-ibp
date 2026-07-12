import { Module } from "@nestjs/common";
import { RequestsController } from "./requests.controller";
import { RequestsService } from "./requests.service";
import { FormValidationService } from "./form-validation.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProductScopeModule } from "../../common/scope/product-scope.module";

@Module({
  imports: [NotificationsModule, ProductScopeModule],
  controllers: [RequestsController],
  providers: [RequestsService, FormValidationService],
})
export class RequestsModule {}
