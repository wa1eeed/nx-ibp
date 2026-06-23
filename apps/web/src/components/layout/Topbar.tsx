"use client";

import { Search, Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function Topbar() {
  const t = useTranslations();

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-line bg-topbar/95 px-5 backdrop-blur sm:px-7">
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

        <button
          type="button"
          className="relative grid h-9 w-9 place-items-center rounded-lg border border-line bg-card text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          aria-label="Notifications"
        >
          <Bell size={17} />
          <span className="absolute end-2 top-2 h-1.5 w-1.5 rounded-full bg-danger ring-2 ring-card" />
        </button>

        <div className="flex items-center gap-2.5 rounded-lg border border-line bg-card py-1 ps-1 pe-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-primary-soft text-[12px] font-bold text-primary-strong">
            {t("topbar.userName").trim().charAt(0)}
          </div>
          <div className="hidden text-end leading-tight sm:block">
            <div className="text-[12.5px] font-semibold text-ink">{t("topbar.userName")}</div>
            <div className="text-[10.5px] text-subtle">{t("topbar.userRole")}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
