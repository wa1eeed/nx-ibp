import { IsArray, IsEmail, IsIn, IsOptional, IsString, Matches, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class ClientContactDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
}

export class CreateClientDto {
  @IsIn(["CORPORATE", "INDIVIDUAL"])
  type!: "CORPORATE" | "INDIVIDUAL";

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional() @Matches(/^\d{10}$/, { message: "السجل التجاري يجب أن يكون 10 أرقام" }) crNumber?: string; // CR سعودي = 10 أرقام
  @IsOptional() @Matches(/^\d{10}$/, { message: "الهوية الوطنية يجب أن تكون 10 أرقام" }) nationalId?: string; // هوية/إقامة = 10 أرقام
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @Matches(/^05\d{8}$/, { message: "رقم الجوال يجب أن يبدأ بـ05 ويتكوّن من 10 أرقام" }) phone?: string; // جوال سعودي
  @IsOptional() @Matches(/^01\d{8}$/, { message: "رقم الهاتف الثابت يجب أن يبدأ بـ01 ويتكوّن من 10 أرقام" }) landline?: string; // هاتف ثابت سعودي
  @IsOptional() @IsString() @MinLength(2) contactName?: string; // اسم شخص التواصل
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() nationalAddress?: string;

  // حقول معيارية لوساطة التأمين
  @IsOptional() @Matches(/^\d{15}$/, { message: "الرقم الضريبي يجب أن يكون 15 رقمًا" }) vatNumber?: string; // ض.ق.م سعودي = 15 رقمًا
  @IsOptional() @IsIn(["captive", "non_captive"]) relationStatus?: string;
  @IsOptional() @IsIn(["llc", "joint_stock", "partnership", "jv", "joint_liability", "sole_proprietor", "individual"]) legalForm?: string;
  @IsOptional() @IsIn(["direct", "producer"]) source?: string;
  @IsOptional() @IsString() producerName?: string;
  @IsOptional() @IsString() businessActivity?: string;
  @IsOptional() @IsString() iban?: string;
  @IsOptional() @IsIn(["collect_full", "direct"]) collectionModel?: string; // آلية التحصيل الافتراضية لوثائقه
  @IsOptional() @IsString() accountManagerId?: string; // مدير الحساب المُعيَّن

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ClientContactDto)
  contacts?: ClientContactDto[];
}
