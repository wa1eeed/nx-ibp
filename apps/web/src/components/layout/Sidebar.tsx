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
  UserCircle,
  KeyRound,
  Bell,
  Plug,
  CreditCard,
  Network,
  ListChecks,
  KanbanSquare,
  Handshake,
  Mail,
  Target,
  ScrollText,
  Umbrella,
  Boxes,
  FolderOpen,
  MessageSquareWarning,
  ShieldAlert,
  Wallet,
  CalendarDays,
  FileSpreadsheet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TENANT_NAV, type NavItem } from "@ibp/shared";
import { Link, usePathname } from "@/i18n/routing";
import { api, getToken } from "@/lib/api";
import { useMobileNav } from "./MobileNavContext";

// شارة «وضع التجربة» تظهر في التطوير المحلي فقط — تُخفى في الإنتاج/staging.
const DEV_ONLY = process.env.NODE_ENV !== "production";

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
  UserCircle,
  KeyRound,
  Bell,
  Plug,
  CreditCard,
  Network,
  ListChecks,
  KanbanSquare,
  Handshake,
  Mail,
  Target,
  ScrollText,
  Umbrella,
  Boxes,
  FolderOpen,
  MessageSquareWarning,
  ShieldAlert,
  Wallet,
  CalendarDays,
  FileSpreadsheet,
};

type Perms = Record<string, { access?: boolean }>;

/** الوحدة المطلوبة صلاحيتها لإظهار عنصر التنقّل. */
function requiredModule(item: NavItem): string {
  if (item.module) return item.module; // وحدة صلاحية صريحة (تختلف عن entitlement)
  if (item.entitlement?.startsWith("module.")) return item.entitlement.replace("module.", "");
  if (item.key === "dashboard") return "dashboard";
  if (item.key === "verification") return "clients";
  if (item.key === "crm") return "sales";
  if (item.key === "producers" || item.key === "insurers") return "finance";
  if (item.key.startsWith("settings")) return "settings";
  return item.key;
}

export function Sidebar() {
  const t = useTranslations();
  const pathname = usePathname();
  const [perms, setPerms] = useState<Perms | null>(null);
  const [features, setFeatures] = useState<string[] | null>(null);

  useEffect(() => {
    if (!getToken()) return;
    void api<{ permissions?: Perms; features?: string[] }>("/auth/me")
      .then((me) => { setPerms(me.permissions ?? {}); setFeatures(me.features ?? []); })
      .catch(() => { setPerms({}); setFeatures([]); });
  }, []);

  // القائمة مُفلترة بـ(أ) صلاحية الدور و(ب) تفعيل الميزة في الباقة (entitlement) — لا يرى إلا ما هو مخوَّل ومشمول بباقته.
  // قبل التحميل لا نُظهر شيئًا (تفاديًا للوميض). الـbackend يفرض الاثنين أيضًا.
  const canSee = (item: NavItem) =>
    perms !== null && features !== null &&
    perms[requiredModule(item)]?.access === true &&
    (!item.entitlement || features.includes(item.entitlement));
  const groups = TENANT_NAV.map((g) => ({ ...g, items: g.items.filter(canSee) })).filter((g) => g.items.length > 0);
  const { open, setOpen } = useMobileNav();

  const content = (
    <>
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
        {groups.map((group) => (
          <div key={group.key} className="mt-5 first:mt-2">
            {group.hideLabel ? null : (
              // عنوان الموديول متبوعًا بخطّ فاصل يمتدّ لآخر السطر — يميّز الرأس عن صفحاته (راحة للعين)
              <div className="mb-2 flex items-center gap-2 px-3">
                <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wider text-subtle">{t(`navGroup.${group.key}`)}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            )}
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
                      onClick={() => setOpen(false)}
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

      {/* تذييل وضع التجربة — في التطوير المحلي فقط */}
      {DEV_ONLY ? (
        <div className="m-3 rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-line">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-warning" />
            <span className="text-[12.5px] font-semibold text-ink">{t("demo.title")}</span>
          </div>
          <p className="mt-0.5 ps-4 text-[11px] leading-snug text-subtle">{t("demo.subtitle")}</p>
        </div>
      ) : null}
    </>
  );

  return (
    <>
      {/* سطح المكتب: قائمة جانبية ثابتة */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-e border-line bg-card lg:flex">{content}</aside>

      {/* الموبايل: درج منزلق مع تعتيم — يُفتح من زر Topbar */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 flex w-[268px] max-w-[82%] flex-col overflow-hidden bg-card shadow-2xl">
            <button onClick={() => setOpen(false)} aria-label="close" className="absolute end-3 top-3.5 z-10 grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-ink"><X size={18} /></button>
            {content}
          </aside>
        </div>
      ) : null}
    </>
  );
}
