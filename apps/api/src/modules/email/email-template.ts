import type { TenantBranding } from "../config/config.service";

/** يهرّب HTML لمنع الحقن في نصوص الإشعارات المعبّأة. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** لون نصّ مقروء (أبيض/داكن) فوق لون الخلفية حسب سطوعه. */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0f172a" : "#ffffff";
}

/**
 * غلاف بريد HTML بهوية المستأجر (شعار + لون أساسي) وثنائي اللغة/الاتجاه.
 * كل التنسيق inline (متطلّب عملاء البريد). `bodyText` نصّ عادي (تُحوَّل أسطره إلى فقرات).
 */
export function renderBrandedEmail(opts: {
  branding: TenantBranding;
  locale: "ar" | "en";
  subject: string;
  bodyText: string;
}): string {
  const { branding, locale } = opts;
  const rtl = locale === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const align = rtl ? "right" : "left";
  const primary = branding.primary || "#0d9488";
  const onPrimary = readableOn(primary);
  const brandName = branding.displayName || branding.logoText || "IBP";
  const year = "2026"; // بلا Date.now في بناء القالب — سنة ثابتة للتذييل
  const footer = rtl ? `© ${year} ${esc(brandName)} — عبر منصّة IBP` : `© ${year} ${esc(brandName)} — powered by IBP`;

  const header = branding.logoUrl
    ? `<img src="${esc(branding.logoUrl)}" alt="${esc(brandName)}" style="max-height:40px;max-width:180px;display:block;margin:0 auto;" />`
    : `<span style="font-size:20px;font-weight:700;color:${onPrimary};">${esc(brandName)}</span>`;

  const paragraphs = opts.bodyText
    .split(/\n{2,}|\n/)
    .filter((p) => p.trim())
    .map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#0f172a;">${esc(p.trim())}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${locale}">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f7f8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7edf0;font-family:'IBM Plex Sans Arabic',Arial,sans-serif;direction:${dir};">
        <tr><td style="background:${primary};padding:20px 24px;text-align:center;">${header}</td></tr>
        <tr><td style="padding:28px 28px 8px;text-align:${align};">
          <h1 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#0f172a;">${esc(opts.subject)}</h1>
          ${paragraphs}
        </td></tr>
        <tr><td style="padding:16px 28px 28px;text-align:${align};">
          <hr style="border:none;border-top:1px solid #e7edf0;margin:8px 0 16px;" />
          <p style="margin:0;font-size:12px;color:#94a3b8;">${footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
