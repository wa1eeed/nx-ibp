import { Module } from "@nestjs/common";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { ZatcaModule } from "./zatca/zatca.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [ZatcaModule, NotificationsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
