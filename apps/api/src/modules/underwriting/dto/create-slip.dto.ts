import { IsArray, IsOptional, IsString } from "class-validator";

export class CreateSlipDto {
  @IsString()
  requestId!: string;

  /** شركات التأمين المستهدفة لإرسال الـ Slip. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  insurers?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}
