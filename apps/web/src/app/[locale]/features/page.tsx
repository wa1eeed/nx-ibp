"use client";

import { ShieldCheck, ArrowLeft, ArrowRight, KanbanSquare, BadgeCheck, FileCheck2, Landmark, Percent, ClipboardList, Users, ShieldAlert, BarChart3, QrCode } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { FeatureViz } from "@/components/landing/FeatureViz";

const ITEMS = [
  { key: "crm", Icon: KanbanSquare, viz: "cards" },
  { key: "underwriting", Icon: BadgeCheck, viz: "flow" },
  { key: "policies", Icon: FileCheck2, viz: "flow" },
  { key: "finance", Icon: Landmark, viz: "bars" },
  { key: "commissions", Icon: Percent, viz: "count" },
  { key: "claims", Icon: ClipboardList, viz: "flow" },
  { key: "hr", Icon: Users, viz: "calendar" },
  { key: "compliance", Icon: ShieldAlert, viz: "scan" },
  { key: "verification", Icon: BadgeCheck, viz: "scan" },
  { key: "reports", Icon: BarChart3, viz: "bars" },
  { key: "zatca", Icon: QrCode, viz: "scan" },
  { key: "multitenant", Icon: Landmark, viz: "bars" },
] as const;

export default function FeaturesPage() {
  const t = useTranslations();
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-topbar/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white shadow-sm"><ShieldCheck size={20} /></div>
            <div className="leading-tight">
              <div className="text-[15px] font-bold text-ink">{t("brand.name")}</div>
              <div className="text-[11px] text-subtle">{t("brand.tagline")}</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <Link href="/signup" className="rounded-lg bg-primary-strong px-4 py-2 text-[13px] font-semibold text-primary-fg hover:bg-primary">{t("landing.hero.ctaPrimary")}</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-6 pt-12 text-center">
        <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink">
          <ArrowRight size={14} className="ltr:rotate-180" /> {t("featuresPage.back")}
        </Link>
        <h1 className="mx-auto max-w-3xl text-[32px] font-bold leading-tight tracking-tight text-ink sm:text-[40px]">{t("featuresPage.title")}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">{t("featuresPage.subtitle")}</p>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((f, i) => (
            <div key={f.key} className="overflow-hidden rounded-card border border-line bg-card shadow-card" style={{ animation: "fx-rise .5s ease-out both", animationDelay: `${i * 0.05}s` }}>
              <div className="p-3 pb-0"><FeatureViz variant={f.viz} /></div>
              <div className="p-5 pt-4">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"><f.Icon size={18} /></div>
                  <h3 className="text-[15px] font-bold text-ink">{t(`featuresPage.items.${f.key}.title`)}</h3>
                </div>
                <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{t(`featuresPage.items.${f.key}.desc`)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-card border border-primary/25 bg-primary-soft/40 p-8 text-center">
          <h2 className="text-[22px] font-bold tracking-tight text-ink">{t("featuresPage.ctaTitle")}</h2>
          <p className="mx-auto mt-2 max-w-xl text-[14px] text-muted">{t("featuresPage.ctaSubtitle")}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-lg bg-primary-strong px-5 py-2.5 text-[14px] font-semibold text-primary-fg hover:bg-primary">
              {t("landing.hero.ctaPrimary")} <ArrowLeft size={16} className="ltr:rotate-180" />
            </Link>
            <Link href="/#pricing" className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-5 py-2.5 text-[14px] font-semibold text-muted hover:bg-surface-2 hover:text-ink">{t("landing.hero.ctaSecondary")}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
