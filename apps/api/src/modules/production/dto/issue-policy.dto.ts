import { IsNumber, IsOptional, IsString } from "class-validator";

export class IssuePolicyDto {
  @IsString()
  requestId!: string;

  /** كود الفرع لرقم الوثيقة (افتراضي: أول فرع للمستأجر). */
  @IsOptional()
  @IsString()
  branchCode?: string;

  /** نسبة عمولة الوساطة % (افتراضي 12.5). */
  @IsOptional()
  @IsNumber()
  commissionRate?: number;
}
