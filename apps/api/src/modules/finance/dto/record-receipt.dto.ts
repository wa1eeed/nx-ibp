import { IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

/** سند قبض (RCV): تحصيل مبلغ من العميل مقابل إشعار مدين، أو استلام عمولة من المؤمِّن. */
export class RecordReceiptDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsIn(["cash", "transfer", "cheque", "card", "pos"])
  method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  receivedDate?: string;
}
