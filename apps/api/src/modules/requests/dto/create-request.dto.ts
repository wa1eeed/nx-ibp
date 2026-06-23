import { IsObject, IsOptional, IsString } from "class-validator";

export class CreateRequestDto {
  @IsString()
  clientId!: string;

  @IsString()
  productLineCode!: string;

  /** الحقول الأساسية المعبّأة — يتحقّق منها المحرّك ضد المخطط. */
  @IsObject()
  base!: Record<string, unknown>;

  /** صفوف الكتل المتكررة: { members: [...], vehicles: [...] } */
  @IsOptional()
  @IsObject()
  blocks?: Record<string, Array<Record<string, unknown>>>;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
