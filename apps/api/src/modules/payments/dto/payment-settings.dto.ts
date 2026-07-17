import { IsBoolean, IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";
import { PAYMENT_PROVIDERS } from "../payment-settings.service";

/** بدء دفع إشعار مدين من بوّابة العميل. */
export class CreatePortalChargeDto {
  @IsString() debitNoteId!: string;
  @IsNumber() @IsPositive() amount!: number;
}

/** حفظ إعدادات بوّابة الدفع للمستأجر. المفتاح السرّي اختياري (الفارغ يُبقي المخزَّن). */
export class SavePaymentSettingsDto {
  @IsIn(PAYMENT_PROVIDERS as unknown as string[]) provider!: string;
  @IsOptional() @IsString() @MaxLength(200) publicKey?: string;
  @IsOptional() @IsString() @MaxLength(300) secretKey?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
}
