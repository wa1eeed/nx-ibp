"use client";

import { useState } from "react";
import { ArrowLeft, KeyRound, ShieldCheck, Server, Wallet, Ban, SlidersHorizontal, Check, Sparkles, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { ContactSalesModal } from "@/components/landing/ContactSalesModal";

export default function OwnershipPage() {
  const t = useTranslations("ownership");
  const [contact, setContact] = useState<string | null>(null);

  const tierPoints = (prefix: string) => [1, 2, 3, 4].map((i) => t(`${prefix}P${i}`));
  const pillars = [
    { icon: Wallet, title: t("pillar1Title"), desc: t("pillar1Desc") },
    { icon: Ban, title: t("pillar2Title"), desc: t("pillar2Desc") },
    { icon: ShieldCheck, title: t("pillar3Title"), desc: t("pillar3Desc") },
    { icon: SlidersHorizontal, title: t("pillar4Title"), desc: t("pillar4Desc") },
  ];

  const Tier = ({ icon: Icon, name, tagline, points, code, featured }: { icon: typeof KeyRound; name: string; tagline: string; points: string[]; code: string; featured?: boolean }) => (
    <div className={`flex flex-col rounded-card border bg-card p-6 shadow-card ${featured ? "border-primary/40 ring-1 ring-primary/20" : "border-line"}`}>
      <div className="mb-3 flex items-center gap-2.5">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary-strong"><Icon size={22} /></div>
        <div><h3 className="text-[16px] font-bold text-ink">{name}</h3></div>
      </div>
      <p className="mb-4 text-[13px] text-muted">{tagline}</p>
      <ul className="mb-5 space-y-2.5">
        {points.map((p, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] text-ink"><Check size={16} className="mt-0.5 shrink-0 text-success" /> {p}</li>
        ))}
      </ul>
      <button onClick={() => setContact(code)} className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary-strong text-[14px] font-semibold text-primary-fg hover:bg-primary">
        {t("cta")}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-card/90 px-5 py-3 backdrop-blur">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"><ArrowLeft size={15} className="rtl:rotate-180" /> {t("backHome")}</Link>
        <div className="text-[15px] font-bold text-ink">{t("nav")}</div>
        <LocaleSwitcher />
      </header>

      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Hero */}
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-[12px] font-semibold text-primary-strong"><Sparkles size={13} /> {t("consultative")}</span>
          <h1 className="mx-auto mt-4 max-w-3xl text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[34px]">{t("heroTitle")}</h1>
          <p className="mx-auto mt-3 max-w-2xl text-[14px] text-muted">{t("heroSub")}</p>
        </div>

        {/* Tiers */}
        <div className="mt-9 grid gap-5 md:grid-cols-2">
          <Tier icon={KeyRound} name={t("tier1Name")} tagline={t("tier1Tagline")} points={tierPoints("tier1")} code="ownership_license" />
          <Tier icon={ShieldCheck} name={t("tier2Name")} tagline={t("tier2Tagline")} points={tierPoints("tier2")} code="ownership_full" featured />
        </div>

        {/* Deployment */}
        <div className="mt-6 flex flex-col items-center gap-3 rounded-card border border-line bg-card p-5 text-center shadow-card sm:flex-row sm:text-start">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-info-soft text-info"><Server size={22} /></div>
          <div><h3 className="text-[14.5px] font-bold text-ink">{t("deployTitle")}</h3><p className="mt-0.5 text-[13px] text-muted">{t("deploySub")}</p></div>
        </div>

        {/* Support (optional) */}
        <div className="mt-6 rounded-card border border-line bg-card p-6 shadow-card">
          <div className="mb-1 flex items-center gap-2"><RefreshCw size={17} className="text-primary" /><h3 className="text-[15px] font-bold text-ink">{t("supportTitle")}</h3></div>
          <p className="mb-3 text-[13px] text-muted">{t("supportSub")}</p>
          <ul className="grid gap-2 sm:grid-cols-3">
            {[1, 2, 3].map((i) => <li key={i} className="flex items-start gap-2 text-[12.5px] text-ink"><Check size={15} className="mt-0.5 shrink-0 text-success" /> {t(`supportP${i}`)}</li>)}
          </ul>
        </div>

        {/* Pillars */}
        <h2 className="mt-12 text-center text-[20px] font-bold text-ink">{t("pillarsTitle")}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p, i) => (
            <div key={i} className="rounded-card border border-line bg-card p-5 text-center shadow-card">
              <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary-strong"><p.icon size={22} /></div>
              <div className="text-[14px] font-bold text-ink">{p.title}</div>
              <p className="mt-1 text-[12.5px] text-muted">{p.desc}</p>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="mt-12 rounded-card border border-primary/30 bg-primary-soft/50 p-7 text-center">
          <h2 className="text-[19px] font-bold text-ink">{t("contactTitle")}</h2>
          <p className="mx-auto mt-1.5 max-w-lg text-[13.5px] text-muted">{t("contactSub")}</p>
          <button onClick={() => setContact("ownership")} className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary-strong px-6 text-[14px] font-semibold text-primary-fg hover:bg-primary">
            {t("cta")}
          </button>
        </div>
      </div>

      {contact ? <ContactSalesModal planCode={contact} onClose={() => setContact(null)} /> : null}
    </div>
  );
}
