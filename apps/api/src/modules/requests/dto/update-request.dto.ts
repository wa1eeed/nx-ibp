import { IsObject, IsOptional } from "class-validator";

/** تعديل طلب تأمين قائم (حالة DRAFT فقط) — العميل والفرع ثابتان؛ تُستبدَل الحقول وصفوف الكتل. */
export class UpdateRequestDto {
  @IsObject()
  base!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  blocks?: Record<string, Array<Record<string, unknown>>>;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
