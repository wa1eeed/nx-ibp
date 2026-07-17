import { Module } from "@nestjs/common";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { ZatcaModule } from "./zatca/zatca.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ConfigModule } from "../config/config.module";

@Module({
  imports: [ZatcaModule, NotificationsModule, ConfigModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
