import { IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";

/** ملحق وثيقة (Endorsement): تعديل على وثيقة مُصدَرة بتاريخ سريان وفرق قسط اختياري. */
export class CreateEndorsementDto {
  @IsIn(["addition", "deletion", "amendment", "cancellation"])
  type!: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  /** فرق القسط: موجب = قسط إضافي، سالب = قسط مُرتجع. */
  @IsOptional()
  @IsNumber()
  premiumDelta?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
