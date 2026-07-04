import { IsEmail, IsOptional, IsString, Matches, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  /** رمز المصادقة الثنائية (TOTP، 6 أرقام) — يُرسَل في الخطوة الثانية عند تفعيلها. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: "رمز التحقّق يجب أن يكون 6 أرقام" })
  mfaCode?: string;
}

export class MfaCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: "الرمز يجب أن يكون 6 أرقام" })
  code!: string;
}
