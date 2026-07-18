import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ReportSchedulesService } from "./report-schedules.service";
import { CreateReportScheduleDto, UpdateReportScheduleDto } from "./dto/report-schedule.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/** §7.3 — التقارير المجدولة/بالبريد (تحت صلاحية `reports`). */
@Controller("reports/schedules")
export class ReportSchedulesController {
  constructor(private readonly schedules: ReportSchedulesService) {}

  @Authorize({ module: "reports", action: "read", entitlement: "module.reports" })
  @Get()
  list(@CurrentUser("tenantId") tenantId: string) {
    return this.schedules.list(tenantId);
  }

  @Authorize({ module: "reports", action: "create", entitlement: "module.reports" })
  @Post()
  create(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: CreateReportScheduleDto) {
    return this.schedules.create(tenantId, userId, dto);
  }

  @Authorize({ module: "reports", action: "update", entitlement: "module.reports" })
  @Patch(":id")
  update(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: UpdateReportScheduleDto) {
    return this.schedules.update(tenantId, userId, id, dto);
  }

  @Authorize({ module: "reports", action: "update", entitlement: "module.reports" })
  @Post(":id/run-now")
  runNow(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string) {
    return this.schedules.runNow(tenantId, userId, id);
  }

  @Authorize({ module: "reports", action: "delete", entitlement: "module.reports" })
  @Delete(":id")
  remove(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string) {
    return this.schedules.remove(tenantId, userId, id);
  }
}
