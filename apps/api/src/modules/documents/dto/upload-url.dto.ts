import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class UploadUrlDto {
  /** نوع الكيان المرتبط: client | policy_request | claim | slip ... */
  @IsString()
  @MinLength(1)
  entityType!: string;

  @IsString()
  @MinLength(1)
  entityId!: string;

  @IsString()
  @MinLength(1)
  fileName!: string;

  @IsString()
  @MinLength(1)
  mime!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  /** ATTACHMENT (يُضغط) أو OFFICIAL (يُحفظ كأصل). */
  @IsOptional()
  @IsIn(["ATTACHMENT", "OFFICIAL"])
  docType?: "ATTACHMENT" | "OFFICIAL";

  /** ربط اختياري بصفّ كتلة متكررة (تابع/مركبة...). */
  @IsOptional()
  @IsString()
  rowId?: string;
}
