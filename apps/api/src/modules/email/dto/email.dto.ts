import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** حفظ وربط إعدادات بريد المستأجر. المفتاح اختياري عند تعديل الاسم/الإيميل فقط. */
export class SaveEmailDto {
  @IsEmail({}, { message: "صيغة البريد غير صحيحة" }) fromEmail!: string;
  @IsString() @MinLength(2) @MaxLength(80) fromName!: string;
  @IsOptional() @IsString() @MaxLength(200) apiKey?: string;
}
