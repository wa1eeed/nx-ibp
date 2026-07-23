import { IsIn, IsNumber, IsObject, IsOptional, IsString, MinLength, MaxLength, IsEmail, IsArray } from "class-validator";

export class CreateClaimDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() policyId?: string;
  @IsOptional() @IsString() insurerName?: string;
  @IsOptional() @IsString() incidentDate?: string;
  @IsOptional() @IsNumber() claimedAmount?: number;
  @IsOptional() @IsNumber() deductible?: number;
  @IsOptional() @IsObject() details?: Record<string, unknown>;
}

export class UpdateClaimStatusDto {
  @IsIn(["RECEIVED", "UNDER_REVIEW", "SUBMITTED", "SETTLED", "CLOSED", "REJECTED"])
  status!: "RECEIVED" | "UNDER_REVIEW" | "SUBMITTED" | "SETTLED" | "CLOSED" | "REJECTED";

  /** يُحدَّد عند التسوية (SETTLED). */
  @IsOptional() @IsNumber() settledAmount?: number;
}

export class ClaimNoteDto {
  @IsString() @MinLength(1) @MaxLength(2000) body!: string;
  /** internal = ملاحظة داخلية (موظفون فقط، الافتراضي) · client = رد ظاهر للعميل. */
  @IsOptional() @IsIn(["internal", "client"]) visibility?: "internal" | "client";
}

export class SendInsurerDto {
  @IsOptional() @IsEmail() to?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(5000) body?: string;
  @IsOptional() @IsArray() @IsEmail({}, { each: true }) cc?: string[];
}

/** فحص التغطية المُسبق — قبل تسجيل المطالبة: مطابقة تاريخ الحادثة بمدّة الوثيقة وحالتها. */
export class ValidateCoverageDto {
  @IsString() policyId!: string;
  @IsOptional() @IsString() incidentDate?: string;
}
