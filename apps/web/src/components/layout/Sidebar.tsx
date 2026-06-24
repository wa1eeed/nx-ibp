"use client";

import {
  LayoutDashboard,
  Users,
  BadgeCheck,
  FileText,
  FileCheck2,
  RefreshCw,
  Coins,
  Percent,
  ClipboardList,
  Headset,
  BarChart3,
  ShieldCheck,
  Landmark,
  Blocks,
  Building2,
  Palette,
  UserCog,
  Bell,
  Plug,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { TENANT_NAV } from "@ibp/shared";
import { Link, usePathname } from "@/i18n/routing";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  BadgeCheck,
  FileText,
  FileCheck2,
  RefreshCw,
  Coins,
  Percent,
  ClipboardList,
  Headset,
  BarChart3,
  ShieldCheck,
  Landmark,
  Blocks,
  Building2,
  Palette,
  UserCog,
  Bell,
  Plug,
};

export function Sidebar() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-e border-line bg-card lg:flex">
      {/* العلامة */}
      <div className="flex items-center gap-2.5 px-5 py-4">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-fg shadow-sm">
          <ShieldCheck size={20} />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold text-ink">{t("brand.name")}</div>
          <div className="text-[11px] text-subtle">{t("brand.tagline")}</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {TENANT_NAV.map((group) => (
          <div key={group.key} className="mt-4 first:mt-2">
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              {t(`navGroup.${group.key}`)}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon] ?? FileText;
                const active = pathname === item.href || pathname.startsWith(item.href + "/");

                if (item.comingSoon) {
                  return (
                    <li key={item.key}>
                      <div className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] text-subtle">
                        <Icon size={18} className="shrink-0" />
                        <span className="flex-1 truncate">{t(`nav.${item.key}`)}</span>
                        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-subtle ring-1 ring-line">
                          {t("common.comingSoon")}
                        </span>
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className={[
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors",
                        active
                          ? "bg-primary-soft font-semibold text-primary-strong"
                          : "text-muted hover:bg-surface-2 hover:text-ink",
                      ].join(" ")}
                    >
                      <Icon size={18} className="shrink-0" />
                      <span className="flex-1 truncate">{t(`nav.${item.key}`)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* تذييل وضع التجربة */}
      <div className="m-3 rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-line">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-warning" />
          <span className="text-[12.5px] font-semibold text-ink">{t("demo.title")}</span>
        </div>
        <p className="mt-0.5 ps-4 text-[11px] leading-snug text-subtle">{t("demo.subtitle")}</p>
      </div>
    </aside>
  );
}
