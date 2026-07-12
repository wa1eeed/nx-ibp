import { IsEmail, IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

/** تحديث بيانات التواصل من البوّابة (حقول التواصل فقط — لا CR/هوية/ضريبي). */
export class UpdateContactDto {
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @Matches(/^05\d{8}$/, { message: "الجوال يجب أن يكون 05 ثم 8 أرقام" }) phone?: string;
  @IsOptional() @Matches(/^01\d{8}$/, { message: "الهاتف الثابت يجب أن يكون 01 ثم 8 أرقام" }) landline?: string;
  @IsOptional() @IsEmail() email?: string;
}

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

/** رد العميل على طلب خدمته (يظهر في المحادثة الظاهرة). */
export class PortalServiceReplyDto {
  @IsString() @MinLength(1) @MaxLength(2000) body!: string;
}

/** تقديم طلب خدمة من البوّابة. */
export class SubmitServiceDto {
  @IsIn(["certificate", "policy_copy", "amendment", "cancellation", "renewal", "inquiry"]) type!: string;
  @IsOptional() @IsString() policyId?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
