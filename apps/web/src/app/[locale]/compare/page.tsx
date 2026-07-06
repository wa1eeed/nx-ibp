"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { PlanComparisonTable } from "@/components/landing/PlanComparisonTable";

export default function ComparePage() {
  const t = useTranslations();
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-card/90 px-5 py-3 backdrop-blur">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"><ArrowLeft size={15} className="rtl:rotate-180" /> {t("compare.backHome")}</Link>
        <div className="text-[15px] font-bold text-ink">{t("compare.title")}</div>
        <LocaleSwitcher />
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-center text-[24px] font-bold tracking-tight text-ink">{t("compare.heading")}</h1>
        <p className="mx-auto mb-8 mt-2 max-w-xl text-center text-[13.5px] text-muted">{t("compare.sub")}</p>
        <PlanComparisonTable />
        <p className="mt-5 text-center text-[12px] text-subtle">{t("compare.footnote")}</p>
      </div>
    </div>
  );
}
