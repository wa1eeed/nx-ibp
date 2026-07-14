import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { PAYMENT_PROVIDERS } from "../payment-settings.service";

/** حفظ إعدادات بوّابة الدفع للمستأجر. المفتاح السرّي اختياري (الفارغ يُبقي المخزَّن). */
export class SavePaymentSettingsDto {
  @IsIn(PAYMENT_PROVIDERS as unknown as string[]) provider!: string;
  @IsOptional() @IsString() @MaxLength(200) publicKey?: string;
  @IsOptional() @IsString() @MaxLength(300) secretKey?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
}
