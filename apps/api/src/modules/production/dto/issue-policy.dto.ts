import { IsIn, IsNumber, IsOptional, IsString } from "class-validator";

export class IssuePolicyDto {
  @IsString()
  requestId!: string;

  /** كود الفرع لرقم الوثيقة (افتراضي: أول فرع للمستأجر). */
  @IsOptional()
  @IsString()
  branchCode?: string;

  /** نسبة عمولة الوساطة % (افتراضي 12.5). */
  @IsOptional()
  @IsNumber()
  commissionRate?: number;

  // حقول معيارية للوثيقة
  @IsOptional() @IsString() insurerPolicyNo?: string; // رقم وثيقة المؤمِّن الرسمي
  @IsOptional() @IsIn(["POLICY", "RENEWAL", "ENDORSEMENT"]) issuanceType?: string;
  @IsOptional() @IsNumber() policyFees?: number; // رسوم الإصدار
  @IsOptional() @IsNumber() sumInsured?: number; // مبلغ التأمين الإجمالي
  @IsOptional() @IsString() paymentTerms?: string; // شروط السداد
  @IsOptional() @IsString() producerName?: string; // المنتِج (نص حرّ — توافق خلفي)
  @IsOptional() @IsString() producerId?: string; // مرجع سجلّ المنتِجين
  @IsOptional() @IsNumber() producerCommission?: number; // عمولة المنتِج (تُحتسب آليًا من نسبته إن غابت)
  @IsOptional() @IsString() salespersonId?: string; // الموظف المُستحِقّ للعمولة الداخلية (افتراضيًا المُصدِر)
  // §9.4 — تعدّد العملات: عملة الوثيقة + سعر صرفها للريال (يُلزَم للأجنبية)
  @IsOptional() @IsString() currency?: string; // افتراضيًا من الطلب أو SAR
  @IsOptional() @IsNumber() fxRate?: number; // سعر التحويل للريال (>0 عند غير SAR)
}
