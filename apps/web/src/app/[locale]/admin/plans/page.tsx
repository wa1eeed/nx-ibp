"use client";

import { useCallback, useEffect, useState } from "react";
import { Package, Users, Save, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { papi, ApiError } from "@/lib/api";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";

interface Entitlement { featureKey: string; mode: string; numericValue: number | null; unitFee: number | null }
interface Plan {
  id: string; code: string; name: string; seatLimit: number; priceMonthly: number; priceYearly: number;
  entitlements: Entitlement[]; _count: { subscriptions: number };
}

const UPLOAD_KEY = "upload.maxFileMb";

export default function AdminPlansPage() {
  const t = useTranslations();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedCode, setSavedCode] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await papi<Plan[]>("/platform/plans");
    setPlans(data);
    setDrafts(Object.fromEntries(data.map((p) => [p.code, String(p.entitlements.find((e) => e.featureKey === UPLOAD_KEY)?.numericValue ?? 10)])));
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  async function saveUpload(code: string) {
    setError(""); setSavedCode("");
    const numericValue = Number(drafts[code]);
    if (!Number.isFinite(numericValue) || numericValue <= 0) { setError(t("admin.login.error")); return; }
    try {
      await papi(`/platform/plans/${code}/entitlements`, { method: "POST", body: JSON.stringify({ featureKey: UPLOAD_KEY, mode: "QUOTA", numericValue }) });
      setSavedCode(code);
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "خطأ"); }
  }

  return (
    <AdminShell>
      <PageHeader title={t("admin.plans.title")} subtitle={t("admin.plans.subtitle")} />
      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const modules = p.entitlements.filter((e) => e.featureKey.startsWith("module.") && e.mode !== "DISABLED");
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
                  <div className="text-[17px] font-bold tnum text-ink">{p.priceMonthly.toLocaleString()}</div>
                  <div className="text-[11px] text-subtle">{t("admin.plans.price")}</div>
                </div>
              </div>

              <div className="mb-3 flex items-center gap-4 text-[12px] text-muted">
                <span className="inline-flex items-center gap-1.5"><Users size={14} /> {p.seatLimit} {t("admin.tenants.col.seats")}</span>
                <span>{p._count.subscriptions} {t("admin.usage.tenants")}</span>
              </div>

              <div className="mb-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">{t("admin.plans.modules")}</div>
                <div className="flex flex-wrap gap-1.5">
                  {modules.map((m) => (
                    <Badge key={m.featureKey} tone={m.mode === "ADDON" ? "warning" : "neutral"}>{m.featureKey.replace("module.", "")}</Badge>
                  ))}
                </div>
              </div>

              <div className="mt-auto border-t border-line pt-3">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-subtle">{t("admin.plans.uploadLimit")}</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} value={drafts[p.code] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [p.code]: e.target.value }))} className="h-9 w-24 rounded-lg border border-line bg-card px-3 text-[13px] tnum" />
                  <button onClick={() => saveUpload(p.code)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12.5px] font-semibold text-white hover:opacity-90">
                    {savedCode === p.code ? <Check size={15} /> : <Save size={15} />} {savedCode === p.code ? t("admin.plans.saved") : t("admin.plans.save")}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AdminShell>
  );
}
