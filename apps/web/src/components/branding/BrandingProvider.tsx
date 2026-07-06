"use client";

import { useEffect } from "react";
import { api, cpapi } from "@/lib/api";

export interface Branding {
  primary: string;
  displayName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  logoText: string | null;
}

/** يفكّ لون hex إلى [r,g,b]. */
function toRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0x0d9488;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
/** يعتّم اللون بنسبة (0..1). */
function darken([r, g, b]: [number, number, number], amt: number) { return hex(r * (1 - amt), g * (1 - amt), b * (1 - amt)); }
/** تلوين فاتح جدًّا (خلفية soft) بمزج مع الأبيض. */
function tint([r, g, b]: [number, number, number], amt: number) { return hex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt); }
/** نصّ مقروء فوق اللون (أبيض/داكن). */
function readable([r, g, b]: [number, number, number]) { return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#0f172a" : "#ffffff"; }

/** يطبّق ألوان الهوية كمتغيّرات CSS على جذر المستند. */
export function applyBranding(b: Branding): void {
  const root = document.documentElement;
  const rgb = toRgb(b.primary || "#0d9488");
  root.style.setProperty("--primary", b.primary || "#0d9488");
  root.style.setProperty("--primary-strong", darken(rgb, 0.14));
  root.style.setProperty("--primary-soft", tint(rgb, 0.9));
  root.style.setProperty("--primary-fg", readable(rgb));
  root.style.setProperty("--ring", `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.35)`);
  if (b.faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = b.faviconUrl;
  }
}

/**
 * يجلب هوية المستأجر (أو العميل عبر البوّابة) ويطبّق ألوانها/أيقونتها على الواجهة.
 * لا يعرض شيئًا — تأثيره جانبيّ فقط (CSS variables على :root). White-label — P0-B.
 */
export function BrandingProvider({ scope = "tenant" }: { scope?: "tenant" | "portal" }) {
  useEffect(() => {
    let alive = true;
    const fetcher = scope === "portal" ? () => cpapi<Branding>("/portal/branding") : () => api<Branding>("/branding");
    void fetcher()
      .then((b) => { if (alive && b) applyBranding(b); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [scope]);
  return null;
}
