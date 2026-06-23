import { IsEmail, IsIn, IsNumber, IsOptional, IsString } from "class-validator";

export class PlatformLoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
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
