import { IsIn, IsNumber, IsObject, IsOptional, IsString, MinLength, MaxLength } from "class-validator";

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
