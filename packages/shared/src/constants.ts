// ثوابت مشتركة على مستوى المنصة (لغة/عملة/تقويم).

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** العربية هي الافتراضية (RTL) — السوق سعودي. */
export const DEFAULT_LOCALE: Locale = "ar";

export const RTL_LOCALES: readonly Locale[] = ["ar"];

export function dirForLocale(locale: Locale): "rtl" | "ltr" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}

export const CURRENCY = "SAR" as const;

/** أوضاع الصلاحية لميزة ضمن باقة (تطابق EntitlementMode في Prisma). */
export const ENTITLEMENT_MODES = [
  "INCLUDED",
  "QUOTA",
  "METERED",
  "ADDON",
  "DISABLED",
] as const;
export type EntitlementMode = (typeof ENTITLEMENT_MODES)[number];

/** أكواد الباقات المرجعية (قابلة للضبط من السوبر أدمن). */
export const PLAN_CODES = ["basic", "premium", "enterprise"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/** اللوحات الأربع. */
export const PANELS = ["super-admin", "tenant", "employee", "client"] as const;
export type Panel = (typeof PANELS)[number];
