import { ArrayNotEmpty, IsArray, IsEmail, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

/** مُستلِم واحد: معرّف الشركة + بريد اختياري (يتجاوز/يكمل السجلّ عند غيابه). */
export class RfqRecipientDto {
  @IsString()
  insurerId!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

/** إرسال طلب العرض (RFQ) بالبريد لشركات التأمين المختارة (مع إمكانية بريد فوري لمن لا بريد له). */
export class SendRfqDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RfqRecipientDto)
  recipients!: RfqRecipientDto[];
}
