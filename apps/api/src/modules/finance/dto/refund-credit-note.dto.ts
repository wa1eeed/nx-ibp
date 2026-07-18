import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class RefundCreditNoteDto {
  @IsOptional() @IsIn(["transfer", "cash", "cheque"]) method?: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
}
