"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Plus, Trash2, CheckCircle2, ChevronLeft, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { Link } from "@/i18n/routing";
import { PageHeader } from "@/components/ui/PageHeader";

interface RunSummary { id: string; period: string; status: string; postedAt: string | null; count: number; net: number }
interface Line { id: string; employeeName: string; baseSalary: number; allowances: number; deductions: number; net: number }
interface RunDetail { id: string; period: string; status: string; voucherId: string | null; lines: Line[]; totals: { base: number; allowances: number; deductions: number; net: number } }

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

/** §8.1 — الرواتب: كشوف رواتب شهرية + ترحيل مصروف (مدين رواتب / دائن نقد). */
export default function PayrollPage() {
  const t = useTranslations("finance.payroll");
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [sel, setSel] = useState<RunDetail | null>(null);
  const [period, setPeriod] = useState(thisMonth());
  const [error, setError] = useState("");

  const loadRuns = useCallback(async () => {
    try { setRuns(await api<RunSummary[]>("/payroll")); } catch { setError(t("error")); }
  }, [t]);
  useEffect(() => { void loadRuns(); }, [loadRuns]);

  const openRun = async (id: string) => { setError(""); try { setSel(await api<RunDetail>(`/payroll/${id}`)); } catch (e) { setError((e as Error).message || t("error")); } };

  async function create() {
    setError("");
    try { const r = await api<RunDetail>("/payroll", { method: "POST", body: JSON.stringify({ period }) }); await loadRuns(); setSel(r); }
    catch (e) { setError((e as Error).message || t("error")); }
  }
  async function saveLine(lineId: string, field: "baseSalary" | "allowances" | "deductions", value: number) {
    if (!sel) return;
    try { setSel(await api<RunDetail>(`/payroll/lines/${lineId}`, { method: "PATCH", body: JSON.stringify({ [field]: value }) })); await loadRuns(); }
    catch (e) { setError((e as Error).message || t("error")); }
  }
  async function post(id: string) {
    setError("");
    try { await api(`/payroll/${id}/post`, { method: "POST" }); await openRun(id); await loadRuns(); }
    catch (e) { setError((e as Error).message || t("error")); }
  }
  async function remove(id: string) {
    setError("");
    try { await api(`/payroll/${id}`, { method: "DELETE" }); if (sel?.id === id) setSel(null); await loadRuns(); }
    catch (e) { setError((e as Error).message || t("error")); }
  }

  const draft = sel?.status === "draft";

  return (
    <div className="space-y-4">
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={
        <Link href="/tenant/finance" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 text-[13px] font-medium text-primary hover:bg-surface-2"><ChevronLeft size={15} className="rtl:rotate-180" /> {t("backToFinance")}</Link>
      } />

      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        {/* الكشوف */}
        <div className="space-y-3">
          <div className="flex items-end gap-2 rounded-card border border-line bg-card p-3">
            <label className="block flex-1">
              <span className="mb-1 block text-[11px] font-medium text-subtle">{t("period")}</span>
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <button type="button" onClick={() => void create()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12.5px] font-semibold text-white hover:opacity-90"><Plus size={15} /> {t("newRun")}</button>
          </div>
          <div className="overflow-hidden rounded-card border border-line bg-card">
            {runs.length === 0 ? <p className="px-4 py-6 text-center text-[12.5px] text-subtle">{t("empty")}</p> : (
              <ul className="divide-y divide-line">
                {runs.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => void openRun(r.id)} className={["flex w-full items-center justify-between gap-2 px-4 py-2.5 text-start hover:bg-surface-2/50", sel?.id === r.id ? "bg-surface-2/60" : ""].join(" ")}>
                      <div>
                        <div className="text-[13px] font-semibold text-ink">{r.period}</div>
                        <div className="text-[11px] text-subtle">{r.count} {t("employees")} · {fmt(r.net)}</div>
                      </div>
                      <span className={["rounded-full px-2 py-0.5 text-[10.5px] font-medium", r.status === "posted" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"].join(" ")}>{t(`status.${r.status}`)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* تفاصيل الكشف */}
        {sel ? (
          <div className="space-y-3 rounded-card border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-bold text-ink">{t("run")} {sel.period}</h2>
                <span className={["rounded-full px-2 py-0.5 text-[11px] font-medium", sel.status === "posted" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"].join(" ")}>{t(`status.${sel.status}`)}</span>
                {sel.voucherId ? <span className="inline-flex items-center gap-1 text-[11px] text-subtle"><FileText size={12} /> {t("posted")}</span> : null}
              </div>
              {draft ? (
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => void post(sel.id)} disabled={sel.totals.net <= 0} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-40"><CheckCircle2 size={14} /> {t("post")}</button>
                  <button type="button" onClick={() => void remove(sel.id)} aria-label={t("remove")} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={14} /></button>
                </div>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                    <th className="px-2 py-2 text-start font-semibold">{t("employee")}</th>
                    <th className="px-2 py-2 text-end font-semibold">{t("base")}</th>
                    <th className="px-2 py-2 text-end font-semibold">{t("allowances")}</th>
                    <th className="px-2 py-2 text-end font-semibold">{t("deductions")}</th>
                    <th className="px-2 py-2 text-end font-semibold">{t("net")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.lines.map((l) => (
                    <tr key={l.id} className="border-b border-line/60 last:border-0">
                      <td className="px-2 py-2 font-medium text-ink">{l.employeeName}</td>
                      {(["baseSalary", "allowances", "deductions"] as const).map((f) => (
                        <td key={f} className="px-2 py-2 text-end">
                          {draft ? (
                            <input type="number" min={0} step="0.01" defaultValue={l[f]} onBlur={(e) => { const v = Number(e.target.value); if (v >= 0 && v !== l[f]) void saveLine(l.id, f, v); }}
                              className="h-8 w-24 rounded-lg border border-line bg-card px-2 text-end text-[12px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
                          ) : <span className="font-mono tabular-nums">{fmt(l[f])}</span>}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-end font-mono font-semibold tabular-nums text-ink">{fmt(l.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line font-bold text-ink">
                    <td className="px-2 py-2">{t("total")}</td>
                    <td className="px-2 py-2 text-end font-mono tabular-nums">{fmt(sel.totals.base)}</td>
                    <td className="px-2 py-2 text-end font-mono tabular-nums">{fmt(sel.totals.allowances)}</td>
                    <td className="px-2 py-2 text-end font-mono tabular-nums">{fmt(sel.totals.deductions)}</td>
                    <td className="px-2 py-2 text-end font-mono tabular-nums">{fmt(sel.totals.net)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : <div className="grid place-items-center rounded-card border border-dashed border-line bg-card p-10 text-[12.5px] text-subtle">{t("selectRun")}</div>}
      </div>
    </div>
  );
}
