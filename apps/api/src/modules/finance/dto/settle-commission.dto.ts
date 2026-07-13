import { IsNumber, IsOptional, IsString, Min } from "class-validator";

/** صرف عمولة موظف (سند PYV). */
export class SettleCommissionDto {
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() paidDate?: string;
}
