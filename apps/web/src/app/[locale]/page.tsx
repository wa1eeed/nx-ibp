"use client";

import { ShieldCheck, ArrowLeft, Users, FileText, Landmark, ClipboardList, BadgeCheck, BarChart3, Check, Building2, Headset, QrCode } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { PricingSection } from "@/components/landing/PricingSection";
import { PlanComparisonTable } from "@/components/landing/PlanComparisonTable";

const FEATURES = [
  { key: "lifecycle", icon: FileText },
  { key: "underwriting", icon: BadgeCheck },
  { key: "finance", icon: Landmark },
  { key: "claims", icon: ClipboardList },
  { key: "verification", icon: Users },
  { key: "multitenant", icon: BarChart3 },
];

export default function LandingPage() {
  const t = useTranslations();

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* شريط علوي */}
      <header className="sticky top-0 z-20 border-b border-line bg-topbar/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white shadow-sm"><ShieldCheck size={20} /></div>
            <div className="leading-tight">
              <div className="text-[15px] font-bold text-ink">{t("brand.name")}</div>
              <div className="text-[11px] text-subtle">{t("brand.tagline")}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <Link href="/login" className="rounded-lg bg-primary-strong px-4 py-2 text-[13px] font-semibold text-primary-fg hover:bg-primary">{t("landing.nav.login")}</Link>
          </div>
        </div>
      </header>

      {/* البطل (Hero) */}
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-16 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-[12.5px] font-medium text-primary-strong">
          <QrCode size={14} /> {t("landing.hero.badge")}
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl text-[34px] font-bold leading-tight tracking-tight text-ink sm:text-[44px]">{t("landing.hero.title")}</h1>
        <p className="mx-auto mt-3 text-[15px] font-medium text-primary-strong">{t("landing.hero.titleEn")}</p>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">{t("landing.hero.subtitle")}</p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className="inline-flex items-center gap-2 rounded-lg bg-primary-strong px-5 py-2.5 text-[14px] font-semibold text-primary-fg hover:bg-primary">
            {t("landing.hero.ctaPrimary")} <ArrowLeft size={16} className="ltr:rotate-180" />
          </Link>
          <a href="#pricing" className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-5 py-2.5 text-[14px] font-semibold text-muted hover:bg-surface-2 hover:text-ink">{t("landing.hero.ctaSecondary")}</a>
        </div>
        <div className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12.5px] text-subtle">
          <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-success" /> {t("landing.hero.t1")}</span>
          <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-success" /> {t("landing.hero.t2")}</span>
          <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-success" /> {t("landing.hero.t3")}</span>
        </div>
      </section>

      {/* المزايا */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <h2 className="text-center text-[26px] font-bold tracking-tight text-ink">{t("landing.features.title")}</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-[14px] text-muted">{t("landing.features.subtitle")}</p>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.key} className="rounded-card border border-line bg-card p-5 shadow-card">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary"><f.icon size={20} /></div>
              <h3 className="mt-3 text-[15px] font-bold text-ink">{t(`landing.features.${f.key}.title`)}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{t(`landing.features.${f.key}.desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* مخصّص لشركات الوساطة */}
      <section className="border-y border-line bg-card/50">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 py-12 lg:grid-cols-2">
          <div>
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-white"><Building2 size={22} /></div>
            <h2 className="mt-4 text-[26px] font-bold tracking-tight text-ink">{t("landing.target.title")}</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">{t("landing.target.desc")}</p>
          </div>
          <ul className="space-y-3">
            {["p1", "p2", "p3", "p4"].map((p) => (
              <li key={p} className="flex items-start gap-3 rounded-lg border border-line bg-card p-3.5">
                <Check size={18} className="mt-0.5 shrink-0 text-success" />
                <span className="text-[13.5px] text-ink">{t(`landing.target.${p}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* الباقات — ديناميكية من الخادم (سعر لكل مستخدم + شهري/سنوي + توفير + تجربة) */}
      <PricingSection />

      {/* مقارنة الباقات — كامل المميزات في الصفحة نفسها (كمرجع التصميم) */}
      <section id="compare-table" className="mx-auto max-w-6xl px-5 pb-14">
        <h2 className="mb-2 text-center text-[22px] font-bold tracking-tight text-ink">{t("compare.heading")}</h2>
        <p className="mx-auto mb-7 max-w-xl text-center text-[13.5px] text-muted">{t("compare.sub")}</p>
        <PlanComparisonTable />
      </section>

      {/* الامتثال */}
      <section className="border-t border-line bg-card/50">
        <div className="mx-auto max-w-6xl px-5 py-12 text-center">
          <h2 className="text-[22px] font-bold tracking-tight text-ink">{t("landing.compliance.title")}</h2>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {["zatca", "pdpl", "ia", "nafath"].map((c) => (
              <span key={c} className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-4 py-2.5 text-[13px] font-medium text-ink shadow-card">
                <ShieldCheck size={15} className="text-primary" /> {t(`landing.compliance.${c}`)}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* دعوة ختامية */}
      <section className="mx-auto max-w-4xl px-5 py-16 text-center">
        <Headset size={28} className="mx-auto text-primary" />
        <h2 className="mt-3 text-[26px] font-bold tracking-tight text-ink">{t("landing.cta.title")}</h2>
        <p className="mx-auto mt-2 max-w-xl text-[14px] text-muted">{t("landing.cta.subtitle")}</p>
        <Link href="/signup" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-strong px-6 py-3 text-[14px] font-semibold text-primary-fg hover:bg-primary">
          {t("landing.cta.button")} <ArrowLeft size={16} className="ltr:rotate-180" />
        </Link>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-[12.5px] text-subtle sm:flex-row">
          <span>© 2026 {t("brand.name")} — {t("landing.footer.rights")}</span>
          <span>{t("landing.footer.madeIn")}</span>
        </div>
      </footer>
    </div>
  );
}
