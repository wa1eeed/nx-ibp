import { IsNumber, IsObject, IsOptional, IsString, MinLength } from "class-validator";

/**
 * عرض شركة تأمين — هجين: حقول معيارية رقمية (للمقارنة الآلية) + نص حر.
 */
export class CreateQuotationDto {
  @IsString()
  @MinLength(2)
  insurerName!: string;

  // ----- الحقول المعيارية (Structured) -----
  @IsOptional() @IsNumber() rate?: number; // %
  @IsOptional() @IsNumber() premium?: number; // القسط الصافي
  @IsOptional() @IsNumber() vat?: number;
  @IsOptional() @IsNumber() totalPremium?: number;
  @IsOptional() @IsNumber() deductible?: number; // مبلغ التحمل
  @IsOptional() @IsNumber() limit?: number; // حد التغطية
  @IsOptional() @IsString() validUntil?: string;
  @IsOptional() @IsObject() coverFields?: Record<string, unknown>;

  // ----- القسم الحر (Free Text) -----
  @IsOptional() @IsString() generalRemarks?: string;
  @IsOptional() @IsString() additionalConditions?: string;
}
