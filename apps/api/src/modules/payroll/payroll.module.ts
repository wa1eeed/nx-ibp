import { Module } from "@nestjs/common";
import { PayrollController } from "./payroll.controller";
import { PayrollService } from "./payroll.service";

/** §8.1 — الرواتب (تحت المالية). */
@Module({
  controllers: [PayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}
