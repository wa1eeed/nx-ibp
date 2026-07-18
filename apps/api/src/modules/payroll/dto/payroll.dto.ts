import { IsNumber, IsOptional, IsString, Matches, Min } from "class-validator";

export class CreatePayrollDto {
  @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "الفترة بصيغة YYYY-MM" })
  period!: string;
}

export class UpdatePayrollLineDto {
  @IsOptional() @IsNumber() @Min(0) baseSalary?: number;
  @IsOptional() @IsNumber() @Min(0) allowances?: number;
  @IsOptional() @IsNumber() @Min(0) deductions?: number;
}
