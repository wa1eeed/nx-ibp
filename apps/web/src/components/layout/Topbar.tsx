"use client";

import { useEffect, useRef, useState } from "react";
import { Search, LogOut, ChevronDown, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { NotificationBell } from "./NotificationBell";
import { useMobileNav } from "./MobileNavContext";
import { api, clearToken, getToken } from "@/lib/api";
import { staffNotifRoute } from "@/lib/notif-routes";
import { useRouter } from "@/i18n/routing";

interface Me { fullName: string; email: string; roleId: string | null }

export function Topbar() {
  const t = useTranslations();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const mobileNav = useMobileNav();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (getToken()) void api<Me>("/auth/me").then(setMe).catch(() => undefined);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function logout() {
    clearToken();
    router.replace("/login");
  }

  // لا نعرض اسمًا افتراضيًا (كان يُظهر مستخدمًا آخر عند انتهاء الجلسة) — نعرض «…» حتى تُحمَّل الهوية.
  const name = me?.fullName ?? "…";
  const role = me?.email ?? "";

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-line bg-topbar/95 px-5 backdrop-blur sm:px-7">
      {/* زر القائمة للموبايل */}
      <button type="button" onClick={() => mobileNav.setOpen(true)} aria-label="menu" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-card text-muted hover:bg-surface-2 hover:text-ink lg:hidden">
        <Menu size={18} />
      </button>

      {/* بحث */}
      <div className="relative hidden max-w-xl flex-1 sm:block">
        <Search
          size={16}
          className="pointer-events-none absolute inset-y-0 my-auto h-4 w-4 text-subtle ltr:left-3 rtl:right-3"
        />
        <input
          type="text"
          placeholder={t("topbar.searchPlaceholder")}
          className="h-9 w-full rounded-full border border-line bg-card text-[13px] text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/30 ltr:pl-9 ltr:pr-4 rtl:pr-9 rtl:pl-4"
        />
      </div>

      <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
        <LocaleSwitcher />

        <NotificationBell apiFn={api} hasToken={() => !!getToken()} basePath="/notifications/inbox" routeFor={staffNotifRoute} />

        {/* قائمة المستخدم + تسجيل الخروج */}
        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-lg border border-line bg-card py-1 ps-1 pe-2 transition-colors hover:bg-surface-2"
          >
            <div className="grid h-7 w-7 place-items-center rounded-full bg-primary-soft text-[12px] font-bold text-primary-strong">
              {name.trim().charAt(0)}
            </div>
            <div className="hidden text-end leading-tight sm:block">
              <div className="text-[12.5px] font-semibold text-ink">{name}</div>
              <div className="max-w-[160px] truncate text-[10.5px] text-subtle">{role}</div>
            </div>
            <ChevronDown size={14} className="text-subtle" />
          </button>

          {open ? (
            <div className="absolute end-0 top-full mt-1.5 w-56 overflow-hidden rounded-xl border border-line bg-card shadow-card">
              <div className="border-b border-line px-4 py-3">
                <div className="text-[13px] font-semibold text-ink">{name}</div>
                {me ? <div className="truncate text-[11.5px] text-subtle">{me.email}</div> : null}
              </div>
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-danger"
              >
                <LogOut size={16} /> {t("topbar.logout")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
