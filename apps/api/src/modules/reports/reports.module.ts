import { Module } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { ReportSchedulesController } from "./report-schedules.controller";
import { ReportSchedulesService } from "./report-schedules.service";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [EmailModule],
  controllers: [ReportsController, ReportSchedulesController],
  providers: [ReportsService, ReportSchedulesService],
  exports: [ReportSchedulesService],
})
export class ReportsModule {}
