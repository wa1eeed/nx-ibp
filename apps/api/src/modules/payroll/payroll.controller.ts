import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { PayrollService } from "./payroll.service";
import { CreatePayrollDto, UpdatePayrollLineDto } from "./dto/payroll.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/** §8.1 — الرواتب (كشوف رواتب + ترحيل مصروف) — تحت المالية (`finance`). */
@Controller("payroll")
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get()
  list() {
    return this.payroll.list();
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get(":id")
  get(@Param("id") id: string) {
    return this.payroll.get(id);
  }

  @Authorize({ module: "finance", action: "create", entitlement: "module.finance" })
  @Post()
  create(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: CreatePayrollDto) {
    return this.payroll.create(tenantId, userId, dto.period);
  }

  @Authorize({ module: "finance", action: "update", entitlement: "module.finance" })
  @Patch("lines/:lineId")
  updateLine(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("lineId") lineId: string, @Body() dto: UpdatePayrollLineDto) {
    return this.payroll.updateLine(tenantId, userId, lineId, dto);
  }

  @Authorize({ module: "finance", action: "create", entitlement: "module.finance" })
  @Post(":id/post")
  post(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string) {
    return this.payroll.post(tenantId, userId, id);
  }

  @Authorize({ module: "finance", action: "delete", entitlement: "module.finance" })
  @Delete(":id")
  remove(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string) {
    return this.payroll.remove(tenantId, userId, id);
  }
}
