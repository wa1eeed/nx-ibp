import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/** إنشاء خطة تقسيط لإشعار مدين. */
export class CreateInstallmentPlanDto {
  @IsInt() @Min(2) @Max(36) count!: number;
  @IsOptional() @IsString() firstDueDate?: string;
}
