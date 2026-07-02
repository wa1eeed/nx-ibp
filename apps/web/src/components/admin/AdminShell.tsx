"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ShieldCheck, Building2, Package, BarChart3, Bell, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { getPlatformToken, clearPlatformToken } from "@/lib/api";

const NAV = [
  { key: "usage", href: "/admin/usage", icon: BarChart3 },
  { key: "tenants", href: "/admin/tenants", icon: Building2 },
  { key: "plans", href: "/admin/plans", icon: Package },
  { key: "notifications", href: "/admin/notifications", icon: Bell },
  { key: "security", href: "/admin/security", icon: ShieldCheck },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getPlatformToken()) router.replace("/admin/login");
    else setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-e border-line bg-card lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-white shadow-sm"><ShieldCheck size={20} /></div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold text-ink">{t("admin.brand")}</div>
            <div className="text-[11px] text-subtle">{t("admin.subtitle")}</div>
          </div>
        </div>
        <nav className="flex-1 px-3 pt-2">
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.key}>
                  <Link href={item.href} className={["flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors", active ? "bg-primary-soft font-semibold text-primary-strong" : "text-muted hover:bg-surface-2 hover:text-ink"].join(" ")}>
                    <item.icon size={18} /> {t(`admin.nav.${item.key}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <button onClick={() => { clearPlatformToken(); router.replace("/admin/login"); }} className="m-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted hover:bg-surface-2 hover:text-danger">
          <LogOut size={16} /> {t("admin.logout")}
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-line bg-topbar/95 px-5 backdrop-blur sm:px-7">
          <span className="rounded-md bg-ink/90 px-2 py-1 text-[11px] font-semibold text-white">SUPER ADMIN</span>
          <span className="text-[13px] text-muted">{t("admin.subtitle")}</span>
        </header>
        <main className="flex-1 px-5 py-6 sm:px-7">{children}</main>
      </div>
    </div>
  );
}
