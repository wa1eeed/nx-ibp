"use client";

import { useCallback, useEffect, useState } from "react";
import { Package, Users, Save, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { papi, ApiError } from "@/lib/api";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/ui/PageHeader";

interface Entitlement { featureKey: string; mode: string; numericValue: number | null; unitFee: number | null }
interface Plan {
  id: string; code: string; name: string; seatLimit: number; priceMonthly: number; priceYearly: number; trialDays: number;
  entitlements: Entitlement[]; _count: { subscriptions: number };
}

const UPLOAD_KEY = "upload.maxFileMb";
const STORAGE_KEY = "storage.quotaMb";

// المميزات القابلة للضبط لكل باقة (تظهر في صفحة المقارنة فورًا).
const TOGGLE_FEATURES: Array<{ key: string; group: "module" | "feature" }> = [
  ...["clients", "sales", "underwriting", "production", "renewals", "service", "claims", "finance", "compliance", "reports", "hr"].map((m) => ({ key: `module.${m}`, group: "module" as const })),
  ...["crm", "producers", "formTemplates", "analytics", "approvalChains", "org", "mfaEnforce", "dlp", "api", "whiteLabel", "prioritySupport"].map((f) => ({ key: `feature.${f}`, group: "feature" as const })),
];
// دورة أوضاع الميزة (يدوّرها السوبر أدمن بالنقر): مشمول ⇒ إضافة ⇒ حسب الاستخدام ⇒ معطّل.
const MODE_CYCLE = ["INCLUDED", "ADDON", "METERED", "DISABLED"];
const MODE_STYLE: Record<string, string> = {
  INCLUDED: "border-success/40 bg-success-soft text-success",
  ADDON: "border-warning/40 bg-warning-soft text-warning",
  METERED: "border-info/40 bg-info-soft text-info",
  DISABLED: "border-line bg-surface-2 text-subtle",
};

export default function AdminPlansPage() {
  const t = useTranslations();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});      // حد الرفع (MB)
  const [storageGb, setStorageGb] = useState<Record<string, string>>({}); // حصّة التخزين (GB)
  const [priceM, setPriceM] = useState<Record<string, string>>({});       // السعر/مستخدم/شهر
  const [priceY, setPriceY] = useState<Record<string, string>>({});       // السعر/مستخدم/سنة
  const [trial, setTrial] = useState<Record<string, string>>({});         // أيام التجربة
  const [saved, setSaved] = useState("");   // "<code>:<featureKey>"
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await papi<Plan[]>("/platform/plans");
    setPlans(data);
    const num = (p: Plan, key: string, fallback: number) => p.entitlements.find((e) => e.featureKey === key)?.numericValue ?? fallback;
    setDrafts(Object.fromEntries(data.map((p) => [p.code, String(num(p, UPLOAD_KEY, 10))])));
    setStorageGb(Object.fromEntries(data.map((p) => [p.code, String(Math.round((num(p, STORAGE_KEY, 1024) / 1024) * 10) / 10)])));
    setPriceM(Object.fromEntries(data.map((p) => [p.code, String(p.priceMonthly)])));
    setPriceY(Object.fromEntries(data.map((p) => [p.code, String(p.priceYearly)])));
    setTrial(Object.fromEntries(data.map((p) => [p.code, String(p.trialDays ?? 0)])));
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  // حفظ التسعير (سعر/مستخدم شهري وسنوي + أيام التجربة) عبر PUT /platform/plans/:code
  async function savePricing(code: string) {
    setError(""); setSaved("");
    const m = Number(priceM[code]), y = Number(priceY[code]), tr = Math.round(Number(trial[code]));
    if (!Number.isFinite(m) || m < 0 || !Number.isFinite(y) || y < 0 || !Number.isFinite(tr) || tr < 0) { setError(t("admin.login.error")); return; }
    try {
      await papi(`/platform/plans/${code}`, { method: "PUT", body: JSON.stringify({ priceMonthly: m, priceYearly: y, trialDays: tr }) });
      setSaved(`${code}:pricing`);
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "خطأ"); }
  }

  async function saveEnt(code: string, featureKey: string, numericValue: number) {
    setError(""); setSaved("");
    if (!Number.isFinite(numericValue) || numericValue <= 0) { setError(t("admin.login.error")); return; }
    try {
      await papi(`/platform/plans/${code}/entitlements`, { method: "POST", body: JSON.stringify({ featureKey, mode: "QUOTA", numericValue }) });
      setSaved(`${code}:${featureKey}`);
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "خطأ"); }
  }
  const saveUpload = (code: string) => saveEnt(code, UPLOAD_KEY, Number(drafts[code]));
  const saveStorage = (code: string) => saveEnt(code, STORAGE_KEY, Math.round(Number(storageGb[code]) * 1024)); // GB ⇒ MB

  // تدوير وضع الميزة لباقة: مشمول ⇒ إضافة ⇒ حسب الاستخدام ⇒ معطّل — يظهر فورًا في صفحة المقارنة
  async function cycleFeature(code: string, featureKey: string, currentMode: string | undefined) {
    setError("");
    const idx = MODE_CYCLE.indexOf(currentMode ?? "DISABLED");
    const next = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    try {
      await papi(`/platform/plans/${code}/entitlements`, { method: "POST", body: JSON.stringify({ featureKey, mode: next }) });
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "خطأ"); }
  }


  return (
    <AdminShell>
      <PageHeader title={t("admin.plans.title")} subtitle={t("admin.plans.subtitle")} />
      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          return (
            <div key={p.id} className="flex flex-col rounded-card border border-line bg-card p-5 shadow-card">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary-strong"><Package size={18} /></div>
                  <div className="leading-tight">
                    <div className="text-[15px] font-bold text-ink">{p.name}</div>
                    <div className="text-[11px] uppercase tracking-wide text-subtle">{p.code}</div>
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-[17px] font-bold tnum text-ink">{p.priceMonthly.toLocaleString()} <span className="text-[11px] font-normal text-subtle">{t("admin.plans.perUserMo")}</span></div>
                  <div className="text-[11px] text-subtle tnum">{p.priceYearly.toLocaleString()} {t("admin.plans.perUserYr")}{p.trialDays > 0 ? ` · ${p.trialDays} ${t("admin.plans.trialDays")}` : ""}</div>
                </div>
              </div>

              <div className="mb-3 flex items-center gap-4 text-[12px] text-muted">
                <span className="inline-flex items-center gap-1.5"><Users size={14} /> {t("admin.plans.perUserModel")}</span>
                <span>{p._count.subscriptions} {t("admin.usage.tenants")}</span>
              </div>

              <div className="mb-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">{t("admin.plans.features")} <span className="text-[10px] normal-case text-subtle/70">— {t("admin.plans.toggleHint")}</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {TOGGLE_FEATURES.map((f) => {
                    const mode = p.entitlements.find((e) => e.featureKey === f.key)?.mode ?? "DISABLED";
                    const shortKey = f.key.replace(/^(module|feature)\./, "");
                    return (
                      <button key={f.key} onClick={() => cycleFeature(p.code, f.key, mode)} title={`${f.key} — ${t(`admin.plans.mode.${mode}`)}`}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors hover:opacity-80 ${MODE_STYLE[mode] ?? MODE_STYLE.DISABLED}`}>
                        {mode === "INCLUDED" ? <Check size={11} /> : <span className="text-[9px] font-bold">{t(`admin.plans.modeShort.${mode}`)}</span>} {t(`planFeature.${shortKey}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-auto space-y-3 border-t border-line pt-3">
                {/* التسعير: لكل مستخدم شهري/سنوي + التجربة المجانية */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-subtle">{t("admin.plans.pricing")}</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <label className="block"><span className="mb-0.5 block text-[10px] text-subtle">{t("admin.plans.perUserMo")}</span><input type="number" min={0} value={priceM[p.code] ?? ""} onChange={(e) => setPriceM((d) => ({ ...d, [p.code]: e.target.value }))} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px] tnum" /></label>
                    <label className="block"><span className="mb-0.5 block text-[10px] text-subtle">{t("admin.plans.perUserYr")}</span><input type="number" min={0} value={priceY[p.code] ?? ""} onChange={(e) => setPriceY((d) => ({ ...d, [p.code]: e.target.value }))} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px] tnum" /></label>
                    <label className="block"><span className="mb-0.5 block text-[10px] text-subtle">{t("admin.plans.trialDays")}</span><input type="number" min={0} value={trial[p.code] ?? ""} onChange={(e) => setTrial((d) => ({ ...d, [p.code]: e.target.value }))} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px] tnum" /></label>
                  </div>
                  <button onClick={() => savePricing(p.code)} className="mt-1.5 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-ink px-3 text-[12.5px] font-semibold text-white hover:opacity-90">
                    {saved === `${p.code}:pricing` ? <Check size={15} /> : <Save size={15} />} {saved === `${p.code}:pricing` ? t("admin.plans.saved") : t("admin.plans.savePricing")}
                  </button>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-subtle">{t("admin.plans.uploadLimit")}</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} value={drafts[p.code] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [p.code]: e.target.value }))} className="h-9 w-24 rounded-lg border border-line bg-card px-3 text-[13px] tnum" />
                    <button onClick={() => saveUpload(p.code)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12.5px] font-semibold text-white hover:opacity-90">
                      {saved === `${p.code}:${UPLOAD_KEY}` ? <Check size={15} /> : <Save size={15} />} {saved === `${p.code}:${UPLOAD_KEY}` ? t("admin.plans.saved") : t("admin.plans.save")}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-subtle">{t("admin.plans.storageLimit")}</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} step="0.5" value={storageGb[p.code] ?? ""} onChange={(e) => setStorageGb((d) => ({ ...d, [p.code]: e.target.value }))} className="h-9 w-24 rounded-lg border border-line bg-card px-3 text-[13px] tnum" />
                    <button onClick={() => saveStorage(p.code)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12.5px] font-semibold text-white hover:opacity-90">
                      {saved === `${p.code}:${STORAGE_KEY}` ? <Check size={15} /> : <Save size={15} />} {saved === `${p.code}:${STORAGE_KEY}` ? t("admin.plans.saved") : t("admin.plans.save")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AdminShell>
  );
}
