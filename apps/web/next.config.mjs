import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// أصل الـ API (للـ connect-src في CSP) — يُقرأ من البيئة، مع سماح https عام للتخزين/المزوّدين
const apiOrigin = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/**
 * سياسة أمان المحتوى (CSP) + ترويسات أمنية (NCA ECC / أفضل الممارسات).
 * ملاحظة: Next يحتاج 'unsafe-inline'/'unsafe-eval' للسكربت (تمهيد الترطيب/التطوير)؛
 * لكن `frame-ancestors 'none'` و`object-src 'none'` و`base-uri`/`form-action` تسدّ أهم النواقل.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${apiOrigin} https:`,
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // لا نكشف X-Powered-By
  // الحزم المشتركة تُترجم كمصدر TS
  transpilePackages: ["@ibp/shared"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
