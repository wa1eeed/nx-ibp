import { IsEmail, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/** شراء مقاعد إضافية (رفع رخصة المستخدمين) — نموذج مسبق الدفع. */
export class CheckoutSeatsDto {
  @IsInt()
  @Min(1)
  @Max(1000)
  addSeats!: number; // عدد المقاعد المراد إضافتها للرخصة

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;
}
