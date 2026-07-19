import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site";

// المسارات العامة (تسويقية) فقط — تُستبعد مناطق التطبيق المحمية
const PUBLIC_PATHS = ["", "/ownership", "/legal/terms", "/legal/privacy", "/legal/dpa", "/legal/sla", "/signup"] as const;
const LAST_MODIFIED = "2026-07-19";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PUBLIC_PATHS.flatMap((p) =>
    routing.locales.map((loc) => ({
      url: `${base}/${loc}${p}`,
      lastModified: LAST_MODIFIED,
      changeFrequency: (p === "" ? "weekly" : "monthly") as "weekly" | "monthly",
      priority: p === "" ? 1 : 0.7,
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, `${base}/${l}${p}`])),
      },
    })),
  );
}
