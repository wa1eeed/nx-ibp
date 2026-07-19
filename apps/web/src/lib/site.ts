/**
 * عنوان الموقع العام (للـ sitemap/robots والوسوم التعريفية).
 * يُقرأ من البيئة عند النشر؛ يسقط إلى مضيف Vercel ثم localhost محليًا.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_PUBLIC_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}
