import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

/** بند في جدول تقسيط مخصّص: تاريخ استحقاق (ISO) + مبلغ. */
export class InstallmentRowDto {
  @IsString() dueDate!: string;
  @IsNumber() @Min(0.01) amount!: number;
}

/**
 * إنشاء/تعديل خطة تقسيط لإشعار مدين — أحد نمطين:
 * - **توزيع سريع:** `count` (2–36) + `firstDueDate` اختياري ⇒ دفعات شهرية متساوية.
 * - **جدول مخصّص:** `schedule` — تاريخ ومبلغ لكل قسط (مجموع المبالغ = إجمالي الإشعار).
 */
export class CreateInstallmentPlanDto {
  @IsOptional() @IsInt() @Min(2) @Max(36) count?: number;
  @IsOptional() @IsString() firstDueDate?: string;
  @IsOptional() @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => InstallmentRowDto) schedule?: InstallmentRowDto[];
}
