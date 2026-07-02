/**
 * المعالجة الضريبية لأقساط التأمين بحسب فرع (فئة) المنتج — بند E1.
 *
 * القاعدة (نظام ضريبة القيمة المضافة السعودي، المادة 29 من اللائحة التنفيذية):
 *  - **تأمين الحياة/الحماية والادخار (فئة LIF)**: خدمة مالية **معفاة** من الضريبة (0%، فئة "E").
 *  - **بقية الفروع** (طبي/مركبات/ممتلكات/هندسي/بحري/حوادث عامة…): قياسية **15%** (فئة "S").
 *
 * ملاحظة معمارية: يبقى الـ API مستقلاً عن @ibp/shared وقت التشغيل (قرار المرحلة 0)،
 * لذا تُعرَّف القاعدة هنا محلياً وتُطابَق نسخة الكتالوج في `packages/shared/src/product-catalog.ts`
 * (المستخدَمة في الواجهة للعرض). فئة المنتج تُشتقّ من `ProductLine.class.code` في قاعدة البيانات.
 *
 * ⚠️ الإعفاء يخصّ **قسط التأمين** المُحمَّل على العميل فقط. عمولة الوساطة (رسم خدمة الوسيط)
 * تبقى خاضعة للضريبة القياسية 15% بصرف النظر عن فرع الوثيقة.
 */

/** أكواد فئات التأمين المُعفاة من ضريبة القيمة المضافة. */
export const VAT_EXEMPT_CLASSES: ReadonlySet<string> = new Set(["LIF"]);

/** فئة الضريبة وفق ZATCA: S=قياسي · E=معفى · Z=صفري · O=خارج النطاق. */
export type VatCategory = "S" | "E" | "Z" | "O";

export interface VatTreatment {
  /** نسبة الضريبة (%). */
  rate: number;
  /** فئة الضريبة وفق ترميز ZATCA. */
  category: VatCategory;
  /** رمز سبب الإعفاء (VATEX-SA-*) — يُملأ للفئة المعفاة فقط. */
  exemptionReasonCode?: string;
  /** نص سبب الإعفاء — يُملأ للفئة المعفاة فقط. */
  exemptionReason?: string;
}

const STANDARD_RATE = 15;

/** المعالجة الضريبية لقسط التأمين بحسب كود فئة المنتج (class code). */
export function vatTreatmentForClass(classCode: string | null | undefined): VatTreatment {
  if (classCode && VAT_EXEMPT_CLASSES.has(classCode)) {
    return {
      rate: 0,
      category: "E",
      exemptionReasonCode: "VATEX-SA-29-7", // خدمات التأمين على الحياة (المادة 29 من اللائحة)
      exemptionReason: "خدمات التأمين على الحياة — معفاة من ضريبة القيمة المضافة",
    };
  }
  return { rate: STANDARD_RATE, category: "S" };
}
