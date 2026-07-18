import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from "class-validator";

export class CreateBankAccountDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(120) bankName?: string;
  @IsOptional() @IsString() @MaxLength(34) iban?: string;
  @IsOptional() @IsString() @MaxLength(40) accountNo?: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsNumber() @Min(0) openingBalance?: number;
}

export class BankLineDto {
  @IsString() txnDate!: string;
  @IsString() @MaxLength(300) description!: string;
  @IsNumber() amount!: number;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
}

export class ImportTransactionsDto {
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => BankLineDto) lines!: BankLineDto[];
}

export class MatchTransactionDto {
  @IsString() voucherId!: string;
}

export class SetTxnStatusDto {
  @IsIn(["unmatched", "ignored"]) status!: "unmatched" | "ignored";
}
