import { IsString } from "class-validator";

export class SelectQuotationDto {
  @IsString()
  quotationId!: string;
}
