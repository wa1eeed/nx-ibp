import { Module } from "@nestjs/common";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";

/** الموارد البشرية (ملفّات الموظفين + الوثائق). التشفير عبر ZatcaCryptoModule العامّ. */
@Module({
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
