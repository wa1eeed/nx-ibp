import { IsEmail, IsIn, IsNumber, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class PortalLoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

/** تقديم مطالبة من البوّابة (على وثيقة العميل). */
export class SubmitClaimDto {
  @IsString() policyId!: string;
  @IsOptional() @IsString() incidentDate?: string;
  @IsOptional() @IsNumber() claimedAmount?: number;
  @IsString() @MinLength(5) @MaxLength(2000) description!: string;
}

/** تقديم طلب خدمة من البوّابة. */
export class SubmitServiceDto {
  @IsIn(["certificate", "policy_copy", "amendment", "cancellation", "renewal", "inquiry"]) type!: string;
  @IsOptional() @IsString() policyId?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
