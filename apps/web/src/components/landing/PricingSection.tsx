"use client";

import { useEffect, useState } from "react";
import { Check, Sparkles, ArrowLeftRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api } from "@/lib/api";

interface PublicPlan {
  code: string; name: string; seatLimit: number;
  pricePerUserMonthly: number; pricePerUserYearly: number; trialDays: number; savingsPct: number; modules: string[];
}

const HIGHLIGHT = "premium";

/** قسم الباقات في اللاندينق — ديناميكي من `/signup/plans` مع تبديل شهري/سنوي + التوفير + التجربة + التسعير لكل مستخدم. */
export function PricingSection() {
  const t = useTranslations();
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [yearly, setYearly] = useState(false);

  useEffect(() => { void api<PublicPlan[]>("/signup/plans").then(setPlans).catch(() => undefined); }, []);

  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-14">
      <h2 className="text-center text-[26px] font-bold tracking-tight text-ink">{t("landing.pricing.title")}</h2>
      <p className="mx-auto mt-2 max-w-xl text-center text-[14px] text-muted">{t("landing.pricing.subtitle")}</p>

      {/* تبديل شهري/سنوي */}
      <div className="mt-6 flex items-center justify-center gap-3">
        <span className={`text-[13px] font-medium ${!yearly ? "text-ink" : "text-subtle"}`}>{t("landing.pricing.monthly")}</span>
        <button onClick={() => setYearly((v) => !v)} role="switch" aria-checked={yearly} className={`relative h-6 w-11 rounded-full transition-colors ${yearly ? "bg-primary-strong" : "bg-surface-2 border border-line"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${yearly ? "start-[1.375rem]" : "start-0.5"}`} />
        </button>
        <span className={`text-[13px] font-medium ${yearly ? "text-ink" : "text-subtle"}`}>{t("landing.pricing.yearly")}</span>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {plans.map((p) => {
          const highlight = p.code === HIGHLIGHT;
          const price = yearly ? p.pricePerUserYearly : p.pricePerUserMonthly;
          const per = yearly ? t("landing.pricing.perUserYear") : t("landing.pricing.perUserMonth");
          return (
            <div key={p.code} className={["relative flex flex-col rounded-card border bg-card p-6 shadow-card", highlight ? "border-primary ring-2 ring-primary/30" : "border-line"].join(" ")}>
              {highlight ? <span className="mb-2 self-start rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-primary-strong">{t("landing.pricing.popular")}</span> : null}
              <h3 className="text-[17px] font-bold text-ink">{t(`landing.pricing.${p.code}.name`)}</h3>
              <p className="mt-1 text-[12.5px] text-muted">{t(`landing.pricing.${p.code}.tagline`)}</p>

              <div className="mt-4 flex items-end gap-1">
                <span className="text-[32px] font-bold tracking-tight text-ink tnum">{fmt(price)}</span>
                <span className="mb-1.5 text-[12px] text-subtle">{t("common.sar")} {per}</span>
              </div>
              {/* توفير السنوي + التجربة المجانية */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {yearly && p.savingsPct > 0 ? <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">{t("landing.pricing.save", { pct: p.savingsPct })}</span> : null}
                {p.trialDays > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary-strong"><Sparkles size={11} /> {t("landing.pricing.trial", { days: p.trialDays })}</span> : null}
              </div>
              <p className="mt-2 text-[11.5px] text-subtle">{t("landing.pricing.upToSeats", { seats: p.seatLimit })}</p>

              <ul className="mt-4 flex-1 space-y-2.5">
                {["f1", "f2", "f3"].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-muted"><Check size={15} className="mt-0.5 shrink-0 text-success" /> {t(`landing.pricing.${p.code}.${f}`)}</li>
                ))}
              </ul>
              <Link href={`/signup?plan=${p.code}&cycle=${yearly ? "yearly" : "monthly"}`} className={["mt-6 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-[13.5px] font-semibold", highlight ? "bg-primary-strong text-primary-fg hover:bg-primary" : "border border-line bg-card text-ink hover:bg-surface-2"].join(" ")}>
                {t("landing.pricing.cta")}
              </Link>
            </div>
          );
        })}
      </div>

      {/* رابط مقارنة الباقات */}
      <div className="mt-6 text-center">
        <Link href="/compare" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-primary hover:underline">
          <ArrowLeftRight size={15} /> {t("landing.pricing.compareLink")}
        </Link>
      </div>
    </section>
  );
}
