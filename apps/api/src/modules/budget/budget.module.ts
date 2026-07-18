import { Module } from "@nestjs/common";
import { BudgetController } from "./budget.controller";
import { BudgetService } from "./budget.service";

/** §1.8 — الموازنة التقديرية مقابل الفعلي (تحت المالية). */
@Module({
  controllers: [BudgetController],
  providers: [BudgetService],
})
export class BudgetModule {}
