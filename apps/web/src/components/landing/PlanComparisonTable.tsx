"use client";

import { Fragment, useEffect, useState } from "react";
import { Check, Minus, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api } from "@/lib/api";

interface ComparePlan { code: string; name: string; pricePerUserMonthly: number; pricePerUserYearly: number; trialDays: number; cells: Record<string, string | number> }
interface CompareData { categories: Array<{ category: string; features: string[] }>; plans: ComparePlan[] }

const HIGHLIGHT = "premium";
const QUOTA_KEYS = new Set(["seats", "storage.quotaMb", "upload.maxFileMb", "trialDays"]);

/** جدول مقارنة الباقات القابل لإعادة الاستخدام (اللاندينق + صفحة /compare). */
export function PlanComparisonTable() {
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
    <div>
      {/* مبدّل شهري/سنوي */}
      <div className="mb-5 flex items-center justify-center gap-3">
        <span className={`text-[13px] font-medium ${!yearly ? "text-ink" : "text-subtle"}`}>{t("landing.pricing.monthly")}</span>
        <button onClick={() => setYearly((v) => !v)} role="switch" aria-checked={yearly} className={`relative h-6 w-11 rounded-full transition-colors ${yearly ? "bg-primary-strong" : "border border-line bg-surface-2"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${yearly ? "start-[1.375rem]" : "start-0.5"}`} />
        </button>
        <span className={`text-[13px] font-medium ${yearly ? "text-ink" : "text-subtle"}`}>{t("landing.pricing.yearly")}</span>
      </div>

      {d ? (
        <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr>
                <th className="w-[34%] border-b border-line px-4 pt-6 align-bottom text-start">
                  <div className="text-[13px] font-bold text-ink">{t("compare.featuresCol")}</div>
                  <div className="mt-0.5 text-[11px] text-subtle">{yearly ? t("compare.billedYearly") : t("compare.billedMonthly")}</div>
                </th>
                {d.plans.map((p) => {
                  const hot = p.code === HIGHLIGHT;
                  return (
                    <th key={p.code} className={`relative border-b px-3 pb-4 pt-6 text-center align-bottom ${hot ? "border-primary/40 bg-gradient-to-b from-primary/10 to-primary/[0.03]" : "border-line"}`}>
                      {hot ? <div className="absolute inset-x-2 top-0 mx-auto w-fit -translate-y-1/2 rounded-full bg-primary-strong px-2.5 py-0.5 text-[9.5px] font-bold text-primary-fg shadow"><Sparkles size={9} className="me-0.5 inline" />{t("landing.pricing.popular")}</div> : null}
                      <div className={`text-[15px] font-extrabold ${hot ? "text-primary-strong" : "text-ink"}`}>{t(`landing.pricing.${p.code}.name`)}</div>
                      <div className="mt-2 flex items-end justify-center gap-1">
                        <span className="text-[26px] font-extrabold leading-none text-ink tnum">{fmt(yearly ? p.pricePerUserYearly : p.pricePerUserMonthly)}</span>
                        <span className="mb-0.5 text-[10px] font-medium text-subtle">{t("common.sar")}</span>
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-subtle">{yearly ? t("compare.perUserYr") : t("compare.perUserMo")}</div>
                      {p.trialDays > 0 ? <div className="mt-1.5 inline-block rounded-full bg-success-soft px-2 py-0.5 text-[9.5px] font-semibold text-success">{t("compare.trialShort", { days: p.trialDays })}</div> : null}
                      <Link href={`/signup?plan=${p.code}&cycle=${yearly ? "yearly" : "monthly"}`} className={`mt-3 flex items-center justify-center rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${hot ? "bg-primary-strong text-primary-fg shadow-sm hover:bg-primary" : "border border-line text-ink hover:bg-surface-2"}`}>{t("compare.choose")}</Link>
                    </th>
                  );
                })}
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
      ) : <p className="py-10 text-center text-[13px] text-subtle">…</p>}
    </div>
  );
}
