import { ArrayNotEmpty, IsArray, IsEmail, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

/** مُستلِم واحد: معرّف الشركة + بريد اختياري (يتجاوز/يكمل السجلّ عند غيابه). */
export class RfqRecipientDto {
  @IsString()
  insurerId!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

/**
 * إرسال طلب العرض (RFQ) بالبريد لشركات التأمين المختارة (مع إمكانية بريد فوري لمن لا بريد له).
 * `subject`/`body` قابلان للتعديل من الموظف (وإلّا تُستخدم الصيغة الافتراضية)؛ `cc` نسخة كربونية.
 */
export class SendRfqDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RfqRecipientDto)
  recipients!: RfqRecipientDto[];

  @IsOptional() @IsString() @MaxLength(300) subject?: string;
  @IsOptional() @IsString() @MaxLength(8000) body?: string;

  @IsOptional() @IsArray() @IsEmail({}, { each: true }) cc?: string[];
}
