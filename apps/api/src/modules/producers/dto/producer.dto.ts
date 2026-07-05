import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/** حقول سجلّ المنتِج (الوسيط الفرعي) — عدا الاسم. */
export class ProducerFields {
  @IsOptional() @IsIn(["INDIVIDUAL", "COMPANY"]) type?: string;
  @IsOptional() @IsString() @MaxLength(60) licenseNo?: string; // رقم ترخيص هيئة التأمين
  @IsOptional() @IsString() @MaxLength(20) crNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) nationalId?: string;
  @IsOptional() @IsString() @MaxLength(120) email?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(34) iban?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionRate?: number; // نسبة عمولة المنتِج من عمولة الوسيط (%)
  @IsOptional() @IsIn(["active", "suspended"]) status?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreateProducerDto extends ProducerFields {
  @IsString() @MaxLength(120) name!: string;
}

export class UpdateProducerDto extends ProducerFields {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
}

/** تسوية مستحقّ المنتِج (صرف عمولته). */
export class SettleProducerDto {
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() @MaxLength(60) reference?: string;
  @IsOptional() @IsString() paidDate?: string;
}
