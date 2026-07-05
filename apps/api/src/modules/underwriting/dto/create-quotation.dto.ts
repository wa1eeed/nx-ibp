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
  @IsOptional() @IsNumber() sumInsured?: number; // مبلغ التأمين
  @IsOptional() @IsNumber() premium?: number; // القسط الصافي
  @IsOptional() @IsNumber() policyFees?: number; // رسوم الوثيقة
  @IsOptional() @IsNumber() vat?: number;
  @IsOptional() @IsNumber() totalPremium?: number; // الإجمالي = صافي + رسوم + ضريبة
  @IsOptional() @IsNumber() commissionRate?: number; // نسبة عمولة الوسيط %
  @IsOptional() @IsNumber() commissionAmount?: number; // مبلغ عمولة الوسيط (Brokerage)
  @IsOptional() @IsNumber() deductible?: number; // مبلغ التحمل
  @IsOptional() @IsNumber() limit?: number; // حد التغطية
  @IsOptional() @IsString() validUntil?: string;
  @IsOptional() @IsObject() coverFields?: Record<string, unknown>;

  // ----- القسم الحر (Free Text) -----
  @IsOptional() @IsString() generalRemarks?: string;
  @IsOptional() @IsString() additionalConditions?: string;
}
