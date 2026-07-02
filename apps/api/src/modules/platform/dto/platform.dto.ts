import { IsEmail, IsIn, IsNumber, IsOptional, IsString } from "class-validator";

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

export class UpdateEntitlementDto {
  @IsString() featureKey!: string;

  @IsIn(["INCLUDED", "QUOTA", "METERED", "ADDON", "DISABLED"])
  mode!: "INCLUDED" | "QUOTA" | "METERED" | "ADDON" | "DISABLED";

  @IsOptional() @IsNumber() numericValue?: number;
  @IsOptional() @IsNumber() unitFee?: number;
}
