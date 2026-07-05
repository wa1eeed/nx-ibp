import { IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class PlatformLoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
  @IsOptional() @IsString() mfaCode?: string; // مطلوب إن كانت المصادقة الثنائية مفعّلة
}

export class MfaCodeDto {
  @IsString() code!: string; // رمز TOTP المكوّن من 6 أرقام
}

export class TenantStatusDto {
  @IsIn(["ACTIVE", "SUSPENDED", "TRIAL", "CANCELLED"])
  status!: "ACTIVE" | "SUSPENDED" | "TRIAL" | "CANCELLED";
}

export class UpdatePlanDto {
  @IsOptional() @IsInt() @Min(1) @Max(100000) seatLimit?: number; // الحد الأقصى للمستخدمين
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() priceMonthly?: number;
  @IsOptional() @IsNumber() priceYearly?: number;
}

export class UpdateEntitlementDto {
  @IsString() featureKey!: string;

  @IsIn(["INCLUDED", "QUOTA", "METERED", "ADDON", "DISABLED"])
  mode!: "INCLUDED" | "QUOTA" | "METERED" | "ADDON" | "DISABLED";

  @IsOptional() @IsNumber() numericValue?: number;
  @IsOptional() @IsNumber() unitFee?: number;
}
