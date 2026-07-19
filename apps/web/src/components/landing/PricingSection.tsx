"use client";

import { useEffect, useState } from "react";
import { Check, Sparkles, ArrowLeftRight, Headset, KeyRound, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api } from "@/lib/api";
import { ContactSalesModal } from "./ContactSalesModal";

interface PublicPlan {
  code: string; name: string; seatLimit: number;
  pricePerUserMonthly: number; pricePerUserYearly: number; trialDays: number; savingsPct: number; modules: string[];
}

const HIGHLIGHT = "premium";
const CONTACT_PLANS = new Set(["enterprise"]); // الباقات الكبيرة: تواصل مبيعات بدل التسجيل الذاتي

/** قسم الباقات في اللاندينق — تبويب علوي (اشتراك شهري/خيار التملّك) فوق الباقات، مع تبديل شهري/سنوي والتسعير لكل مستخدم. */
export function PricingSection() {
  const t = useTranslations();
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [mode, setMode] = useState<"subscription" | "ownership">("subscription");
  const [yearly, setYearly] = useState(false);
  const [contact, setContact] = useState<{ open: boolean; plan?: string }>({ open: false });

  useEffect(() => { void api<PublicPlan[]>("/signup/plans").then(setPlans).catch(() => undefined); }, []);

  const fmt = (n: number) => n.toLocaleString("en-US");

  const tabBtn = (val: "subscription" | "ownership", label: string) => (
    <button
      type="button"
      onClick={() => setMode(val)}
      aria-pressed={mode === val}
      className={["inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13.5px] font-semibold transition-colors", mode === val ? "bg-primary-strong text-primary-fg shadow-sm" : "text-muted hover:text-ink"].join(" ")}
    >
      {val === "ownership" ? <KeyRound size={15} /> : null}{label}
    </button>
  );

  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-14">
      <h2 className="text-center text-[26px] font-bold tracking-tight text-ink">{t("landing.pricing.title")}</h2>
      <p className="mx-auto mt-2 max-w-xl text-center text-[14px] text-muted">{t("landing.pricing.subtitle")}</p>

      {/* تبويب: اشتراك شهري / خيار التملّك (للمؤسسات) — فوق الباقات */}
      <div className="mt-6 flex justify-center">
        <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
          {tabBtn("subscription", t("landing.pricing.modeSubscription"))}
          {tabBtn("ownership", t("landing.pricing.modeOwnership"))}
        </div>
      </div>

      {mode === "subscription" ? (
        <>
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
                  <p className="mt-2 text-[11.5px] text-subtle">{t("landing.pricing.anyUsers")}</p>

                  <ul className="mt-4 flex-1 space-y-2.5">
                    {["f1", "f2", "f3"].map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[13px] text-muted"><Check size={15} className="mt-0.5 shrink-0 text-success" /> {t(`landing.pricing.${p.code}.${f}`)}</li>
                    ))}
                  </ul>
                  {CONTACT_PLANS.has(p.code) ? (
                    <button onClick={() => setContact({ open: true, plan: p.code })} className={["mt-6 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-[13.5px] font-semibold", highlight ? "bg-primary-strong text-primary-fg hover:bg-primary" : "border border-line bg-card text-ink hover:bg-surface-2"].join(" ")}>
                      <Headset size={15} /> {t("landing.pricing.contactCta")}
                    </button>
                  ) : (
                    <Link href={`/signup?plan=${p.code}&cycle=${yearly ? "yearly" : "monthly"}`} className={["mt-6 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-[13.5px] font-semibold", highlight ? "bg-primary-strong text-primary-fg hover:bg-primary" : "border border-line bg-card text-ink hover:bg-surface-2"].join(" ")}>
                      {t("landing.pricing.cta")}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          {/* روابط: مقارنة الباقات + تواصل مبيعات */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a href="#compare-table" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-primary hover:underline">
              <ArrowLeftRight size={15} /> {t("landing.pricing.compareLink")}
            </a>
            <button onClick={() => setContact({ open: true })} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-primary hover:underline">
              <Headset size={15} /> {t("landing.pricing.contactSales")}
            </button>
          </div>
        </>
      ) : (
        /* خيار التملّك (للمؤسسات) — البدائل معروضة داخل التبويب بدل رابط خارجي */
        <div className="mt-7">
          <p className="mx-auto mb-6 max-w-2xl text-center text-[13.5px] text-muted">{t("landing.pricing.ownershipIntro")}</p>
          <div className="grid gap-5 md:grid-cols-2">
            {([
              { icon: KeyRound, code: "ownership_license", prefix: "tier1", featured: false },
              { icon: ShieldCheck, code: "ownership_full", prefix: "tier2", featured: true },
            ] as const).map((ti) => (
              <div key={ti.code} className={["flex flex-col rounded-card border bg-card p-6 shadow-card", ti.featured ? "border-primary/40 ring-1 ring-primary/20" : "border-line"].join(" ")}>
                <div className="mb-3 flex items-center gap-2.5">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary-strong"><ti.icon size={22} /></div>
                  <h3 className="text-[16px] font-bold text-ink">{t(`ownership.${ti.prefix}Name`)}</h3>
                </div>
                <p className="mb-4 text-[13px] text-muted">{t(`ownership.${ti.prefix}Tagline`)}</p>
                <ul className="mb-5 flex-1 space-y-2.5">
                  {[1, 2, 3, 4].map((i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-ink"><Check size={16} className="mt-0.5 shrink-0 text-success" /> {t(`ownership.${ti.prefix}P${i}`)}</li>
                  ))}
                </ul>
                <button onClick={() => setContact({ open: true, plan: ti.code })} className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary-strong text-[14px] font-semibold text-primary-fg hover:bg-primary">
                  <Headset size={15} /> {t("ownership.cta")}
                </button>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Link href="/ownership" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-primary hover:underline">
              <KeyRound size={15} /> {t("landing.pricing.ownershipFull")}
            </Link>
          </div>
        </div>
      )}

      {/* نافذة تواصل المبيعات */}
      {contact.open ? <ContactSalesModal planCode={contact.plan} onClose={() => setContact({ open: false })} /> : null}
    </section>
  );
}
