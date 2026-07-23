import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class PlatformLoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
  @IsOptional() @IsString() mfaCode?: string; // مطلوب إن كانت المصادقة الثنائية مفعّلة
}

/** تحديث حالة طلب تواصل مبيعات (Lead). */
export class LeadStatusDto {
  @IsIn(["new", "contacted", "closed"]) status!: "new" | "contacted" | "closed";
}

export class MfaCodeDto {
  @IsString() code!: string; // رمز TOTP المكوّن من 6 أرقام
}

export class TenantStatusDto {
  @IsIn(["ACTIVE", "SUSPENDED", "TRIAL", "CANCELLED"])
  status!: "ACTIVE" | "SUSPENDED" | "TRIAL" | "CANCELLED";
}

/** تغيير باقة اشتراك مستأجر (يفعله سوبر أدمن المنصّة). */
export class ChangeTenantPlanDto {
  @IsString() planCode!: string; // basic | premium | enterprise
  @IsOptional() @IsIn(["MONTHLY", "YEARLY"]) cycle?: "MONTHLY" | "YEARLY";
}

/** ضبط/تمديد تاريخ تجديد اشتراك مستأجر — إمّا تاريخ صريح أو تمديد بعدد أشهر. */
export class SetRenewalDto {
  @IsOptional() @IsString() renewsAt?: string; // ISO date — تاريخ التجديد الصريح
  @IsOptional() @IsInt() @Min(1) @Max(60) months?: number; // تمديد بعدد أشهر من الآن (بديل عن التاريخ)
}

export class UpdatePlanDto {
  @IsOptional() @IsInt() @Min(1) @Max(100000) seatLimit?: number; // الحد الأقصى للمستخدمين
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0) priceMonthly?: number; // لكل مستخدم/شهر
  @IsOptional() @IsNumber() @Min(0) priceYearly?: number; // لكل مستخدم/سنة
  @IsOptional() @IsInt() @Min(0) @Max(365) trialDays?: number; // مدة التجربة المجانية (0 = بلا)
  @IsOptional() @IsInt() @Min(0) @Max(720) slaResponseHours?: number; // زمن استجابة الدعم (ساعات؛ 0 = بلا تعهّد)
}

export class UpdateEntitlementDto {
  @IsString() featureKey!: string;

  @IsIn(["INCLUDED", "QUOTA", "METERED", "ADDON", "DISABLED"])
  mode!: "INCLUDED" | "QUOTA" | "METERED" | "ADDON" | "DISABLED";

  @IsOptional() @IsNumber() numericValue?: number;
  @IsOptional() @IsNumber() unitFee?: number;
}

/**
 * استيراد دفعة سجلات تجارية من السوبر أدمن (upsert برقم السجل). الواجهة تُقسّم الملفّ
 * إلى دُفعات (≤ حدّ الجسم 2mb) وتُرسل كلّ دفعة على حدة. الحدّ 5000 صفّ/طلب.
 */
export class ImportCrRegistryDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5000)
  rows!: Array<Record<string, unknown>>;

  @IsOptional() @IsString() @MaxLength(120) source?: string; // وسم اللقطة/المصدر (مثال: manual_2026q3)
}
