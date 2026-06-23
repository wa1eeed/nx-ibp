import { Module } from "@nestjs/common";
import { RequestsController } from "./requests.controller";
import { RequestsService } from "./requests.service";
import { FormValidationService } from "./form-validation.service";

@Module({
  controllers: [RequestsController],
  providers: [RequestsService, FormValidationService],
})
export class RequestsModule {}
