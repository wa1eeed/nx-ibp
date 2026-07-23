import { IsArray, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested, ArrayMinSize } from "class-validator";
import { Type } from "class-transformer";

const VOUCHER_TYPES = ["JRV", "PYV", "RCV", "DPV"] as const;

/** سند يدويّ من أيّ نوع (قيد يومية · صرف · قبض · دفع مباشر) — أطراف متوازنة، يُنشأ مسودّة. */
export class CreateVoucherDto {
  @IsOptional() @IsIn(VOUCHER_TYPES) type?: string;
  @IsString() @MinLength(2) @MaxLength(300) description!: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => JournalEntryLineDto)
  entries!: JournalEntryLineDto[];
}

/** تعديل سند مسودّة. */
export class UpdateVoucherDto {
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => JournalEntryLineDto)
  entries?: JournalEntryLineDto[];
}

/** طرف قيد: حساب ترحيل + مدين أو دائن (يُفرض XOR والتوازن في الخدمة). */
export class JournalEntryLineDto {
  @IsString() @MinLength(4) account!: string;
  @IsOptional() @IsNumber() @Min(0) debit?: number;
  @IsOptional() @IsNumber() @Min(0) credit?: number;
}

/** قيد يومية يدوي / مصروف — سند JRV بأطراف متوازنة. */
export class CreateJournalDto {
  @IsString() @MinLength(2) @MaxLength(300) description!: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => JournalEntryLineDto)
  entries!: JournalEntryLineDto[];
}
