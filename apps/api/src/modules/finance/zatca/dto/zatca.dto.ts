import { IsOptional, IsString, Length } from "class-validator";

export class ZatcaConfigDto {
  // التحقّق الدلالي (15 رقماً يبدأ وينتهي بـ 3) في الخدمة ⇒ 422 (وفق مواصفة ZATCA)
  @IsString() vatNumber!: string;

  @IsString() businessNameAr!: string;
  @IsOptional() @IsString() businessNameEn?: string;
  @IsOptional() @IsString() egsSerialNumber?: string;
}

export class ExchangeOtpDto {
  @IsString() @Length(6, 6, { message: "رمز OTP يجب أن يكون 6 أرقام" })
  otp!: string;
}
