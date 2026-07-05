import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

/** إلغاء وثيقة مُصدَرة: تاريخ سريان الإلغاء (لحساب القسط المُرتجَع نسبةً وتناسبًا) + السبب. */
export class CancelPolicyDto {
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
