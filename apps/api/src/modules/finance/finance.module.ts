import { Module } from "@nestjs/common";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { ZatcaModule } from "./zatca/zatca.module";

@Module({
  imports: [ZatcaModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
