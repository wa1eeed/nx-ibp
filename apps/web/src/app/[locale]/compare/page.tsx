"use client";

import { Fragment, useEffect, useState } from "react";
import { Check, Minus, ArrowLeft, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api } from "@/lib/api";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";

interface ComparePlan { code: string; name: string; pricePerUserMonthly: number; pricePerUserYearly: number; trialDays: number; cells: Record<string, string | number> }
interface CompareData { categories: Array<{ category: string; features: string[] }>; plans: ComparePlan[] }

const HIGHLIGHT = "premium";
const QUOTA_KEYS = new Set(["seats", "storage.quotaMb", "upload.maxFileMb", "trialDays"]);

export default function ComparePage() {
  const t = useTranslations();
  const [d, setD] = useState<CompareData | null>(null);
  const [yearly, setYearly] = useState(false);
  useEffect(() => { void api<CompareData>("/signup/compare").then(setD).catch(() => undefined); }, []);

  const labelKey = (k: string) => {
    if (k === "seats") return "planFeature.seats";
    if (k === "storage.quotaMb") return "planFeature.storage";
    if (k === "upload.maxFileMb") return "planFeature.upload";
    if (k === "trialDays") return "planFeature.trial";
    return `planFeature.${k.replace(/^(module|feature)\./, "")}`;
  };
  const fmt = (n: number) => n.toLocaleString("en-US");

  function cell(key: string, val: string | number) {
    if (key === "seats") return <span className="text-[12.5px] font-medium text-ink tnum">{t("compare.upTo")} {val}</span>;
    if (key === "storage.quotaMb") return <span className="text-[12.5px] font-medium text-ink tnum">{val} GB</span>;
    if (key === "upload.maxFileMb") return <span className="text-[12.5px] font-medium text-ink tnum">{val} MB</span>;
    if (key === "trialDays") return Number(val) > 0 ? <span className="text-[12.5px] font-medium text-success tnum">{val} {t("compare.days")}</span> : <Minus size={15} className="mx-auto text-subtle/50" />;
    if (val === "INCLUDED") return <Check size={17} className="mx-auto text-success" />;
    if (val === "ADDON") return <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10.5px] font-semibold text-warning">{t("compare.addon")}</span>;
    return <Minus size={15} className="mx-auto text-subtle/50" />;
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-card/90 px-5 py-3 backdrop-blur">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"><ArrowLeft size={15} className="rtl:rotate-180" /> {t("compare.backHome")}</Link>
        <div className="text-[15px] font-bold text-ink">{t("compare.title")}</div>
        <LocaleSwitcher />
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-center text-[24px] font-bold tracking-tight text-ink">{t("compare.heading")}</h1>
        <p className="mx-auto mt-2 max-w-xl text-center text-[13.5px] text-muted">{t("compare.sub")}</p>

        {/* مبدّل شهري/سنوي */}
        <div className="mt-5 flex items-center justify-center gap-3">
          <span className={`text-[13px] font-medium ${!yearly ? "text-ink" : "text-subtle"}`}>{t("landing.pricing.monthly")}</span>
          <button onClick={() => setYearly((v) => !v)} role="switch" aria-checked={yearly} className={`relative h-6 w-11 rounded-full transition-colors ${yearly ? "bg-primary-strong" : "border border-line bg-surface-2"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${yearly ? "start-[1.375rem]" : "start-0.5"}`} />
          </button>
          <span className={`text-[13px] font-medium ${yearly ? "text-ink" : "text-subtle"}`}>{t("landing.pricing.yearly")}</span>
        </div>

        {d ? (
          <div className="mt-8 overflow-x-auto rounded-card border border-line bg-card shadow-card">
            <table className="w-full min-w-[640px] border-collapse">
              {/* رأس: الباقات */}
              <thead className="sticky top-[52px] z-10">
                <tr className="bg-card">
                  <th className="w-[34%] border-b border-line px-4 py-4 text-start" />
                  {d.plans.map((p) => (
                    <th key={p.code} className={`border-b px-3 py-4 text-center ${p.code === HIGHLIGHT ? "border-primary bg-primary/5" : "border-line"}`}>
                      {p.code === HIGHLIGHT ? <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary-strong"><Sparkles size={10} /> {t("landing.pricing.popular")}</div> : null}
                      <div className="text-[14px] font-bold text-ink">{t(`landing.pricing.${p.code}.name`)}</div>
                      <div className="mt-0.5 text-[15px] font-bold text-primary-strong tnum">{fmt(yearly ? p.pricePerUserYearly : p.pricePerUserMonthly)}</div>
                      <div className="text-[10.5px] text-subtle">{yearly ? t("compare.perUserYr") : t("compare.perUserMo")}</div>
                      <Link href={`/signup?plan=${p.code}&cycle=${yearly ? "yearly" : "monthly"}`} className={`mt-2 inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[11.5px] font-semibold ${p.code === HIGHLIGHT ? "bg-primary-strong text-primary-fg hover:bg-primary" : "border border-line text-ink hover:bg-surface-2"}`}>{t("compare.choose")}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.categories.map((cat) => (
                  <Fragment key={cat.category}>
                    <tr className="bg-surface-2/60">
                      <td colSpan={d.plans.length + 1} className="px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-subtle">{t(`compare.cat.${cat.category}`)}</td>
                    </tr>
                    {cat.features.map((key) => (
                      <tr key={key} className="border-b border-line/60 hover:bg-surface-2/30">
                        <td className="px-4 py-2.5 text-[12.5px] text-ink">{t(labelKey(key))}</td>
                        {d.plans.map((p) => (
                          <td key={p.code} className={`px-3 py-2.5 text-center ${p.code === HIGHLIGHT ? "bg-primary/5" : ""}`}>{cell(key, p.cells[key] ?? (QUOTA_KEYS.has(key) ? 0 : "DISABLED"))}</td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-10 text-center text-[13px] text-subtle">…</p>}

        <p className="mt-5 text-center text-[12px] text-subtle">{t("compare.footnote")}</p>
      </div>
    </div>
  );
}
