import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // مناطق التطبيق المحمية (بادئة اللغة /ar|/en) + الـ API
        disallow: ["/*/tenant", "/*/admin", "/*/portal", "/*/billing", "/*/login", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
