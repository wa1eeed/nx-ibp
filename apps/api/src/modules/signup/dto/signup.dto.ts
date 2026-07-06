import { IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

/**
 * تسجيل ذاتي لشركة وساطة جديدة (مستأجر جديد). عام بلا مصادقة — يُزوّد المستأجر
 * آليًا (اشتراك + أدوار + مدير + شجرة حسابات) ويُسجّل الدخول مباشرةً.
 */
export class SignupDto {
  @IsString()
  @MinLength(2, { message: "اسم الشركة مطلوب" })
  @MaxLength(120)
  companyName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyNameEn?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: "رقم السجل التجاري 10 أرقام" })
  crNumber?: string;

  @IsString()
  @MinLength(2, { message: "اسم المدير مطلوب" })
  @MaxLength(120)
  adminName!: string;

  @IsEmail({}, { message: "بريد إلكتروني غير صالح" })
  adminEmail!: string;

  // نفس سياسة كلمات المرور المعتمدة (8 أحرف + كبير/صغير/رقم)
  @IsString()
  @MinLength(8, { message: "كلمة المرور 8 أحرف على الأقل" })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, { message: "كلمة المرور يجب أن تحوي حرفاً كبيراً وصغيراً ورقماً" })
  password!: string;

  /** كود الباقة (افتراضي basic). يُتحقَّق من وجوده. */
  @IsOptional()
  @IsString()
  planCode?: string;

  // ——— بيانات الـOnboarding (التحقّق بعدد خانات دقيق للمعايير السعودية) ———

  /** الرقم الموحد للمنشأة — 10 أرقام (700-series). */
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: "الرقم الموحد للمنشأة 10 أرقام" })
  unifiedNumber?: string;

  /** الرقم الضريبي — 15 رقمًا. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{15}$/, { message: "الرقم الضريبي 15 رقمًا" })
  vatNumber?: string;

  /** رقم التواصل — جوال سعودي 05XXXXXXXX (10 أرقام). */
  @IsOptional()
  @IsString()
  @Matches(/^05\d{8}$/, { message: "رقم الجوال يجب أن يبدأ بـ05 ويتكوّن من 10 أرقام" })
  phone?: string;

  /** عدد المستخدمين المطلوب (التسعير لكل مستخدم). افتراضي 1، ولا يتجاوز حدّ الباقة. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  seatCount?: number;

  /** دورة الفوترة. */
  @IsOptional()
  @IsIn(["MONTHLY", "YEARLY"])
  cycle?: "MONTHLY" | "YEARLY";
}
