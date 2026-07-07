"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Target as TargetIcon, Plus, Trash2, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Row { id: string; scope: string; scopeRefId: string; label: string; metric: string; period: string; periodStart: string; target: number; actual: number; achievementPct: number }
interface Options { producers: { id: string; name: string }[]; lines: string[]; metrics: string[]; periods: string[]; scopes: string[] }

const todayMonthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };

export default function TargetsPage() {
  const t = useTranslations("targets");
  const [rows, setRows] = useState<Row[]>([]);
  const [opts, setOpts] = useState<Options | null>(null);
  const [periodFilter, setPeriodFilter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ scope: "producer", scopeRefId: "", metric: "premium", period: "month", periodStart: todayMonthStart(), targetValue: "" });

  const load = useCallback(async () => {
    const q = periodFilter ? `?period=${periodFilter}` : "";
    setRows(await api<Row[]>(`/targets${q}`));
  }, [periodFilter]);
  useEffect(() => { void load().catch(() => undefined); }, [load]);
  useEffect(() => { void api<Options>("/targets/options").then(setOpts).catch(() => undefined); }, []);

  const refOptions = useMemo(() => {
    if (!opts) return [] as { value: string; label: string }[];
    return form.scope === "producer" ? opts.producers.map((p) => ({ value: p.id, label: p.name })) : opts.lines.map((l) => ({ value: l, label: l }));
  }, [opts, form.scope]);

  async function create() {
    setError(""); setNotice("");
    const refId = form.scopeRefId || refOptions[0]?.value;
    if (!refId) { setError(t("error")); return; }
    try {
      await api("/targets", { method: "POST", body: JSON.stringify({ scope: form.scope, scopeRefId: refId, metric: form.metric, period: form.period, periodStart: new Date(form.periodStart).toISOString(), targetValue: Number(form.targetValue) }) });
      setNotice(t("created")); setForm((f) => ({ ...f, targetValue: "" })); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : t("error")); }
  }
  async function remove(id: string) { await api(`/targets/${id}`, { method: "DELETE" }); await load(); }

  const fmt = (n: number) => n.toLocaleString("en-US");
  const field = "h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px] text-ink";
  const barColor = (pct: number) => (pct >= 100 ? "bg-success" : pct >= 60 ? "bg-primary-strong" : pct >= 30 ? "bg-warning" : "bg-danger");

  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      {notice ? <p className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{notice}</p> : null}

      {/* نموذج هدف جديد */}
      <section className="rounded-card border border-line bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink"><Plus size={15} className="text-primary" /> {t("newTarget")}</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <label className="block"><span className="mb-1 block text-[11px] text-subtle">{t("scope")}</span>
            <select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value, scopeRefId: "" }))} className={field}>
              {(opts?.scopes ?? ["producer", "line"]).map((s) => <option key={s} value={s}>{t(`scopes.${s}`)}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-[11px] text-subtle">{t("scopeRef")}</span>
            <select value={form.scopeRefId} onChange={(e) => setForm((f) => ({ ...f, scopeRefId: e.target.value }))} className={field}>
              {refOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-[11px] text-subtle">{t("metric")}</span>
            <select value={form.metric} onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value }))} className={field}>
              {(opts?.metrics ?? ["premium", "policies", "commissions"]).map((m) => <option key={m} value={m}>{t(`metrics.${m}`)}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-[11px] text-subtle">{t("period")}</span>
            <select value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} className={field}>
              {(opts?.periods ?? ["month", "quarter", "year"]).map((p) => <option key={p} value={p}>{t(`periods.${p}`)}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-[11px] text-subtle">{t("periodStart")}</span>
            <input type="date" value={form.periodStart} onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} className={`${field} tnum`} />
          </label>
          <label className="block"><span className="mb-1 block text-[11px] text-subtle">{t("targetValue")}</span>
            <input type="number" min={0} value={form.targetValue} onChange={(e) => setForm((f) => ({ ...f, targetValue: e.target.value }))} className={`${field} tnum`} />
          </label>
        </div>
        <button onClick={create} disabled={!form.targetValue} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">
          <Check size={15} /> {t("create")}
        </button>
        <p className="mt-2 text-[11px] text-subtle">{t("note")}</p>
      </section>

      {/* فلتر الفترة */}
      <div className="flex items-center gap-2">
        <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} className="h-9 rounded-lg border border-line bg-card px-3 text-[12.5px]">
          <option value="">{t("filterAll")}</option>
          {["month", "quarter", "year"].map((p) => <option key={p} value={p}>{t(`periods.${p}`)}</option>)}
        </select>
      </div>

      {/* لوحة الأهداف */}
      {rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-card py-10 text-center text-[13px] text-subtle">{t("empty")}</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-card border border-line bg-card p-4 shadow-card">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="text-[14px] font-bold text-ink">{r.label}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium text-muted">{t(`scopes.${r.scope}`)}</span>
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 font-medium text-primary-strong">{t(`metrics.${r.metric}`)}</span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium text-muted">{t(`periods.${r.period}`)}</span>
                  </div>
                </div>
                <button onClick={() => remove(r.id)} title={t("delete")} className="rounded-md border border-line p-1.5 text-subtle hover:bg-danger-soft hover:text-danger"><Trash2 size={14} /></button>
              </div>
              <div className="mb-1.5 flex items-end justify-between text-[12.5px]">
                <span className="text-muted">{t("actual")}: <span className="font-semibold text-ink tnum">{fmt(r.actual)}</span> / {t("target")}: <span className="tnum">{fmt(r.target)}</span></span>
                <span className={`text-[15px] font-bold tnum ${r.achievementPct >= 100 ? "text-success" : "text-ink"}`}>{r.achievementPct}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div className={`h-full rounded-full ${barColor(r.achievementPct)}`} style={{ width: `${Math.min(100, r.achievementPct)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
