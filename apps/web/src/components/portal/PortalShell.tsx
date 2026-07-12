"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ShieldCheck, LayoutDashboard, FileCheck2, FileText, ClipboardList, Receipt, FolderOpen, UserCog, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { getPortalToken, clearPortalToken, cpapi } from "@/lib/api";
import { clientNotifRoute } from "@/lib/notif-routes";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { BrandingProvider } from "@/components/branding/BrandingProvider";

const NAV = [
  { key: "dashboard", href: "/portal/dashboard", icon: LayoutDashboard },
  { key: "policies", href: "/portal/policies", icon: FileCheck2 },
  { key: "requests", href: "/portal/requests", icon: FileText },
  { key: "claims", href: "/portal/claims", icon: ClipboardList },
  { key: "statement", href: "/portal/statement", icon: Receipt },
  { key: "documents", href: "/portal/documents", icon: FolderOpen },
  { key: "account", href: "/portal/account", icon: UserCog },
];

export function PortalShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getPortalToken()) router.replace("/portal/login");
    else setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <BrandingProvider scope="portal" />
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-e border-line bg-card lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white shadow-sm"><ShieldCheck size={20} /></div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold text-ink">{t("portal.brand")}</div>
            <div className="text-[11px] text-subtle">{t("portal.subtitle")}</div>
          </div>
        </div>
        <nav className="flex-1 px-3 pt-2">
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.key}>
                  <Link href={item.href} className={["flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors", active ? "bg-primary-soft font-semibold text-primary-strong" : "text-muted hover:bg-surface-2 hover:text-ink"].join(" ")}>
                    <item.icon size={18} /> {t(`portal.nav.${item.key}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <button onClick={() => { clearPortalToken(); router.replace("/portal/login"); }} className="m-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted hover:bg-surface-2 hover:text-danger">
          <LogOut size={16} /> {t("portal.logout")}
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-line bg-topbar/95 px-5 backdrop-blur sm:px-7">
          <span className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-white">{t("portal.badge")}</span>
          <span className="text-[13px] text-muted">{t("portal.subtitle")}</span>
          <div className="ms-auto">
            <NotificationBell apiFn={cpapi} hasToken={() => !!getPortalToken()} basePath="/portal/notifications" allowMarkAll={false} routeFor={clientNotifRoute} />
          </div>
        </header>
        <main className="flex-1 px-5 py-6 sm:px-7">{children}</main>
      </div>
    </div>
  );
}
