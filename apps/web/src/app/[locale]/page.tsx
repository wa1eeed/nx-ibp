"use client";

import { ShieldCheck, ArrowLeft, Users, FileText, Landmark, ClipboardList, BadgeCheck, Check, Building2, Headset, QrCode, KanbanSquare, Percent, Wallet } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { PricingSection } from "@/components/landing/PricingSection";
import { PlanComparisonTable } from "@/components/landing/PlanComparisonTable";
import { WorkflowAnimation } from "@/components/landing/WorkflowAnimation";
import { AiAgentsSection } from "@/components/landing/AiAgentsSection";
import { StatsBand } from "@/components/landing/StatsBand";
import { Reveal } from "@/components/landing/Reveal";

// المميزات تغطّي كل الموديولات (تشمل CRM · المالية · العمولات · الموارد البشرية)
const FEATURES = [
  { key: "lifecycle", icon: FileText },
  { key: "crm", icon: KanbanSquare },
  { key: "underwriting", icon: BadgeCheck },
  { key: "finance", icon: Landmark },
  { key: "commissions", icon: Percent },
  { key: "claims", icon: ClipboardList },
  { key: "hr", icon: Wallet },
  { key: "verification", icon: Users },
];

export default function LandingPage() {
  const t = useTranslations();
  const [pricingMode, setPricingMode] = useState<"subscription" | "ownership">("subscription"); // إخفاء جدول المقارنة في وضع التملّك

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
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* روابط القسم الرئيسي — مخفية على الجوّال */}
            <nav className="hidden items-center gap-5 text-[13px] font-medium text-muted md:flex">
              <a href="#features" className="hover:text-ink">{t("landing.nav.features")}</a>
              <a href="#ai" className="hover:text-ink">{t("landing.nav.ai")}</a>
              <a href="#pricing" className="hover:text-ink">{t("landing.nav.pricing")}</a>
              <Link href="/ownership" className="hover:text-ink">{t("landing.nav.ownership")}</Link>
            </nav>
            <LocaleSwitcher />
            <Link href="/login" className="rounded-lg bg-primary-strong px-4 py-2 text-[13px] font-semibold text-primary-fg hover:bg-primary">{t("landing.nav.login")}</Link>
          </div>
        </div>
      </header>

      {/* البطل (Hero) */}
      <section className="relative overflow-hidden">
        {/* توهّج أورورا يتنفّس خلف البطل — عمق حيّ بأسلوب صفحات الفنتك */}
        <div
          className="pointer-events-none absolute inset-x-0 -top-24 -z-0 h-[520px] opacity-80"
          style={{ background: "radial-gradient(38% 50% at 50% 20%, rgba(16,127,109,.14), transparent 70%), radial-gradient(30% 42% at 22% 45%, rgba(16,127,109,.10), transparent 70%), radial-gradient(30% 42% at 80% 40%, rgba(16,127,109,.09), transparent 70%)", animation: "hero-aurora 11s ease-in-out infinite" }}
          aria-hidden
        />
        <div className="relative z-10 mx-auto max-w-6xl px-5 pb-10 pt-16 text-center">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-[12.5px] font-medium text-primary-strong">
              <QrCode size={14} /> {t("landing.hero.badge")}
            </span>
            <h1 className="mx-auto mt-5 max-w-3xl text-[34px] font-bold leading-tight tracking-tight text-ink sm:text-[44px]">{t("landing.hero.title")}</h1>
            <p className="mx-auto mt-3 text-[15px] font-medium text-primary-strong">{t("landing.hero.titleEn")}</p>
            <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">{t("landing.hero.subtitle")}</p>
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-lg bg-primary-strong px-5 py-2.5 text-[14px] font-semibold text-primary-fg transition-transform hover:-translate-y-0.5 hover:bg-primary">
                {t("landing.hero.ctaPrimary")} <ArrowLeft size={16} className="ltr:rotate-180" />
              </Link>
              <a href="#pricing" className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-5 py-2.5 text-[14px] font-semibold text-muted hover:bg-surface-2 hover:text-ink">{t("landing.hero.ctaSecondary")}</a>
            </div>
            <div className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12.5px] text-subtle">
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-success" /> {t("landing.hero.t1")}</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-success" /> {t("landing.hero.t2")}</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-success" /> {t("landing.hero.t3")}</span>
            </div>
          </Reveal>

          {/* أنيميشن سير المعاملة — مصمَّم بالكود (يعطي انطباع منصّة متقدّمة) */}
          <Reveal delay={220}>
            <div className="mt-12">
              <WorkflowAnimation />
            </div>
          </Reveal>
        </div>
      </section>

      {/* شريط إحصاءات المنصّة — أرقام تتصاعد عند التمرير */}
      <StatsBand />

      {/* المزايا — تغطّي كل الموديولات */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-12">
        <Reveal>
          <h2 className="text-center text-[26px] font-bold tracking-tight text-ink">{t("landing.features.title")}</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-[14px] text-muted">{t("landing.features.subtitle")}</p>
        </Reveal>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.key} delay={(i % 4) * 80}>
              <div className="group relative h-full overflow-hidden rounded-card border border-line bg-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg">
                <span className="absolute end-4 top-4 text-[12px] font-bold tabular-nums text-line transition-colors group-hover:text-primary/50">{String(i + 1).padStart(2, "0")}</span>
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary transition-transform duration-300 group-hover:scale-110"><f.icon size={20} /></div>
                <h3 className="mt-3 text-[15px] font-bold text-ink">{t(`landing.features.${f.key}.title`)}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{t(`landing.features.${f.key}.desc`)}</p>
              </div>
            </Reveal>
          ))}
        </div>
        {/* تصفّح جميع المميزات — يقود للصفحة المستقلّة */}
        <div className="mt-8 text-center">
          <Link href="/features" className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft px-5 py-2.5 text-[14px] font-semibold text-primary-strong hover:bg-primary/15">
            {t("landing.features.browseAll")} <ArrowLeft size={16} className="ltr:rotate-180" />
          </Link>
        </div>
      </section>

      {/* وكلاء الذكاء الاصطناعي */}
      <div id="ai" className="scroll-mt-16">
        <AiAgentsSection />
      </div>

      {/* مخصّص لشركات الوساطة */}
      <section className="border-y border-line bg-card/50">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 py-12 lg:grid-cols-2">
          <Reveal>
            <div>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-white"><Building2 size={22} /></div>
              <h2 className="mt-4 text-[26px] font-bold tracking-tight text-ink">{t("landing.target.title")}</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">{t("landing.target.desc")}</p>
            </div>
          </Reveal>
          <ul className="space-y-3">
            {["p1", "p2", "p3", "p4"].map((p, i) => (
              <Reveal key={p} delay={i * 80}>
                <li className="flex items-start gap-3 rounded-lg border border-line bg-card p-3.5 transition-colors hover:border-primary/30">
                  <Check size={18} className="mt-0.5 shrink-0 text-success" />
                  <span className="text-[13.5px] text-ink">{t(`landing.target.${p}`)}</span>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* الباقات — ديناميكية من الخادم (سعر لكل مستخدم + شهري/سنوي + توفير + تجربة) */}
      <PricingSection onModeChange={setPricingMode} />

      {/* مقارنة الباقات — تخصّ باقات الاشتراك؛ تُخفى في وضع «التملّك» (المؤسسات) */}
      {pricingMode === "subscription" ? (
        <section id="compare-table" className="mx-auto max-w-6xl px-5 pb-14">
          <h2 className="mb-2 text-center text-[22px] font-bold tracking-tight text-ink">{t("compare.heading")}</h2>
          <p className="mx-auto mb-7 max-w-xl text-center text-[13.5px] text-muted">{t("compare.sub")}</p>
          <PlanComparisonTable />
        </section>
      ) : null}

      {/* الامتثال */}
      <section className="border-t border-line bg-card/50">
        <div className="mx-auto max-w-6xl px-5 py-12 text-center">
          <Reveal>
            <h2 className="text-[22px] font-bold tracking-tight text-ink">{t("landing.compliance.title")}</h2>
          </Reveal>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {["zatca", "pdpl", "ia", "nafath"].map((c, i) => (
              <Reveal key={c} delay={i * 70}>
                <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-4 py-2.5 text-[13px] font-medium text-ink shadow-card transition-transform hover:-translate-y-0.5">
                  <ShieldCheck size={15} className="text-primary" /> {t(`landing.compliance.${c}`)}
                </span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* دعوة ختامية */}
      <section className="mx-auto max-w-4xl px-5 py-16 text-center">
        <Reveal>
          <Headset size={28} className="mx-auto text-primary" />
          <h2 className="mt-3 text-[26px] font-bold tracking-tight text-ink">{t("landing.cta.title")}</h2>
          <p className="mx-auto mt-2 max-w-xl text-[14px] text-muted">{t("landing.cta.subtitle")}</p>
          <Link href="/signup" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-strong px-6 py-3 text-[14px] font-semibold text-primary-fg transition-transform hover:-translate-y-0.5 hover:bg-primary">
            {t("landing.cta.button")} <ArrowLeft size={16} className="ltr:rotate-180" />
          </Link>
        </Reveal>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-6">
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12.5px] font-medium text-muted">
            <Link href="/legal/terms" className="hover:text-ink">{t("landing.footer.terms")}</Link>
            <Link href="/legal/privacy" className="hover:text-ink">{t("landing.footer.privacy")}</Link>
            <Link href="/legal/dpa" className="hover:text-ink">{t("landing.footer.dpa")}</Link>
            <Link href="/legal/sla" className="hover:text-ink">{t("landing.footer.sla")}</Link>
            <Link href="/ownership" className="hover:text-ink">{t("ownership.nav")}</Link>
          </nav>
          <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-line pt-4 text-[12.5px] text-subtle sm:flex-row">
            <span>© 2026 {t("brand.name")} — {t("landing.footer.rights")}</span>
            <span className="font-medium text-muted">{t("landing.footer.byNx")}</span>
            <span>{t("landing.footer.madeIn")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
