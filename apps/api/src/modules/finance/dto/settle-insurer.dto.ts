import { IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from "class-validator";

/** سند صرف (PYV): تسوية ما يستحقّ للمؤمِّن (صافي القسط المحتفَظ به أمانةً). */
export class SettleInsurerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  insurerName!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  paidDate?: string;
}
