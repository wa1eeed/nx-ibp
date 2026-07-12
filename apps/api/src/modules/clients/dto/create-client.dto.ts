import { IsArray, IsEmail, IsIn, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
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

  @IsOptional() @IsString() crNumber?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() nationalAddress?: string;

  // حقول معيارية لوساطة التأمين
  @IsOptional() @IsString() vatNumber?: string;
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
