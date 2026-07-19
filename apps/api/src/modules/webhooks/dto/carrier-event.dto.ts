import { IsDateString, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * حمولة حدث المؤمِّن اللاتزامني (تحديث وثيقة/ملحق/حالة). عقد منظَّم موحَّد يُخطَّط عليه
 * أي مزوّد لاحقًا؛ الحمولة الخاصّة بكل مؤمِّن تُحفظ في `data` لتُخطَّط عند التكامل الفعلي.
 */
export class CarrierEventDto {
  @IsString() @MaxLength(120) eventId!: string; // معرّف فريد للحدث (منع التكرار/idempotency)

  @IsString() @MaxLength(80) eventType!: string; // policy.updated | policy.cancelled | endorsement.issued | claim.updated ...

  @IsOptional() @IsString() @MaxLength(80) policyRef?: string; // مرجع الوثيقة لدينا (sequenceNo)

  @IsOptional() @IsString() @MaxLength(80) carrierPolicyNo?: string; // رقم وثيقة المؤمِّن

  @IsOptional() @IsString() @MaxLength(40) status?: string;

  @IsOptional() @IsDateString() effectiveDate?: string;

  @IsOptional() @IsObject() data?: Record<string, unknown>; // الحمولة الخام للمؤمِّن (تُخطَّط لاحقًا)
}
