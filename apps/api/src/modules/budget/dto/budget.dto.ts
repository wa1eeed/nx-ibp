import { IsIn, IsInt, IsNumber, IsString, Max, Min, MinLength } from "class-validator";

/** فترات الموازنة المدعومة: سنوية أو أحد الأرباع. */
export const BUDGET_PERIODS = ["annual", "Q1", "Q2", "Q3", "Q4"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

/** ضبط بند موازنة لحساب في سنة/فترة (upsert على المفتاح الفريد). */
export class SetBudgetDto {
  @IsInt() @Min(2000) @Max(2100)
  fiscalYear!: number;

  @IsIn(BUDGET_PERIODS as unknown as string[])
  period!: string;

  @IsString() @MinLength(1)
  accountCode!: string;

  @IsNumber() @Min(0)
  amount!: number;
}
