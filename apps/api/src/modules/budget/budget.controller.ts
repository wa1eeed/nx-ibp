import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { BudgetService } from "./budget.service";
import { SetBudgetDto } from "./dto/budget.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/** §1.8 — الموازنة التقديرية ومقارنتها بالفعلي (تحت المالية `finance`). */
@Controller("finance/budget")
export class BudgetController {
  constructor(private readonly budget: BudgetService) {}

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get()
  budgets(@Query("year") year?: string) {
    return this.budget.budgets(this.year(year));
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("vs-actual")
  vsActual(@Query("year") year?: string, @Query("period") period = "annual") {
    return this.budget.vsActual(this.year(year), period);
  }

  @Authorize({ module: "finance", action: "create", entitlement: "module.finance" })
  @Post()
  set(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: SetBudgetDto) {
    return this.budget.setBudget(tenantId, userId, dto);
  }

  @Authorize({ module: "finance", action: "delete", entitlement: "module.finance" })
  @Delete(":id")
  remove(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string) {
    return this.budget.deleteBudget(tenantId, userId, id);
  }

  /** يحلّل السنة من الاستعلام؛ الافتراضي السنة الحالية. */
  private year(y?: string): number {
    const n = y ? Number(y) : new Date().getUTCFullYear();
    return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : new Date().getUTCFullYear();
  }
}
