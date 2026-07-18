"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Target, Plus, Trash2, ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { Link } from "@/i18n/routing";
import { PageHeader } from "@/components/ui/PageHeader";

interface PostAcct { code: string; name: string; accountType: string | null }
interface Row { id: string; accountCode: string; accountName: string; accountType: string | null; budget: number; actual: number; variance: number; variancePct: number | null }
interface Report { year: number; period: string; from: string; to: string; rows: Row[]; totals: { budget: number; actual: number; variance: number } }

const PERIODS = ["annual", "Q1", "Q2", "Q3", "Q4"] as const;
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// حساب دائن الطبيعة (إيراد/خصم/حقوق ملكية): تجاوز الفعلي للموازنة = تفوّق (أخضر)؛ المصروف/الأصل: تجاوز = سلبي (أحمر)
const CREDIT_NATURE = new Set(["revenue", "liability", "equity"]);

/** §1.8 — الموازنة التقديرية مقابل الفعلي: ضبط موازنة لكل حساب/فترة ومقارنتها بالفعلي المُشتقّ من السندات. */
export default function BudgetPage() {
  const t = useTranslations("finance.budget");
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [period, setPeriod] = useState<string>("annual");
  const [accounts, setAccounts] = useState<PostAcct[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [error, setError] = useState("");

  const loadAccounts = useCallback(async () => {
    try { setAccounts(await api<PostAcct[]>("/finance/posting-accounts")); } catch { /* لا يمنع التقرير */ }
  }, []);
  const loadReport = useCallback(async () => {
    try { setReport(await api<Report>(`/finance/budget/vs-actual?year=${year}&period=${period}`)); }
    catch (e) { setError((e as Error).message || t("error")); }
  }, [year, period, t]);
  useEffect(() => { void loadAccounts(); }, [loadAccounts]);
  useEffect(() => { void loadReport(); }, [loadReport]);

  const budgetedCodes = useMemo(() => new Set(report?.rows.map((r) => r.accountCode) ?? []), [report]);
  const available = accounts.filter((a) => !budgetedCodes.has(a.code));

  async function save(accountCode: string, amount: number) {
    setError("");
    try {
      await api("/finance/budget", { method: "POST", body: JSON.stringify({ fiscalYear: year, period, accountCode, amount }) });
      await loadReport();
    } catch (e) { setError((e as Error).message || t("error")); }
  }
  async function add() {
    const amount = Number(newAmount);
    if (!newCode || !(amount >= 0)) return;
    await save(newCode, amount);
    setNewCode(""); setNewAmount("");
  }
  async function remove(id: string) {
    setError("");
    try { await api(`/finance/budget/${id}`, { method: "DELETE" }); await loadReport(); }
    catch (e) { setError((e as Error).message || t("error")); }
  }

  const varianceTone = (row: { accountType: string | null; variance: number }) => {
    if (Math.abs(row.variance) < 0.01) return "text-subtle";
    const favorable = CREDIT_NATURE.has(row.accountType ?? "") ? row.variance > 0 : row.variance < 0;
    return favorable ? "text-success" : "text-danger";
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={
        <Link href="/tenant/finance" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 text-[13px] font-medium text-primary hover:bg-surface-2"><ChevronLeft size={15} className="rtl:rotate-180" /> {t("backToFinance")}</Link>
      } />

      {/* السنة + الفترة */}
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-card p-3">
        <label className="inline-flex items-center gap-2 text-[13px]">
          <span className="text-subtle">{t("year")}</span>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || thisYear)}
            className="h-9 w-24 rounded-lg border border-line bg-card px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)}
              className={["h-8 rounded-lg px-3 text-[12.5px] font-semibold transition-colors", period === p ? "bg-ink text-white" : "border border-line text-ink hover:bg-surface-2"].join(" ")}>
              {t(`period.${p}`)}
            </button>
          ))}
        </div>
        {report ? <span className="text-[11.5px] text-subtle">{report.from} — {report.to}</span> : null}
      </div>

      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {/* إضافة بند موازنة */}
      <div className="flex flex-wrap items-end gap-2.5 rounded-card border border-line bg-card p-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-subtle">{t("account")}</span>
          <select value={newCode} onChange={(e) => setNewCode(e.target.value)}
            className="h-9 w-72 max-w-full rounded-lg border border-line bg-card px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">{t("selectAccount")}</option>
            {available.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-subtle">{t("amount")}</span>
          <input type="number" min={0} step="0.01" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0.00"
            className="h-9 w-40 rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <button type="button" onClick={() => void add()} disabled={!newCode || newAmount === ""}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-4 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-40">
          <Plus size={15} /> {t("add")}
        </button>
      </div>

      {/* جدول الموازنة مقابل الفعلي */}
      <div className="overflow-x-auto rounded-card border border-line bg-card">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11.5px] uppercase tracking-wide text-subtle">
              <th className="px-3 py-2.5 text-start font-semibold">{t("account")}</th>
              <th className="px-3 py-2.5 text-end font-semibold">{t("budget")}</th>
              <th className="px-3 py-2.5 text-end font-semibold">{t("actual")}</th>
              <th className="px-3 py-2.5 text-end font-semibold">{t("variance")}</th>
              <th className="px-3 py-2.5 text-end font-semibold">%</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {report?.rows.length ? report.rows.map((r) => (
              <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-surface-2/40">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-ink">{r.accountName}</div>
                  <div className="font-mono text-[10.5px] text-subtle">{r.accountCode}</div>
                </td>
                <td className="px-3 py-2.5 text-end">
                  <input type="number" min={0} step="0.01" defaultValue={r.budget}
                    onBlur={(e) => { const v = Number(e.target.value); if (v >= 0 && v !== r.budget) void save(r.accountCode, v); }}
                    className="h-8 w-28 rounded-lg border border-line bg-card px-2 text-end text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </td>
                <td className="px-3 py-2.5 text-end font-mono tabular-nums text-ink">{fmt(r.actual)}</td>
                <td className={["px-3 py-2.5 text-end font-mono font-semibold tabular-nums", varianceTone(r)].join(" ")}>{r.variance > 0 ? "+" : ""}{fmt(r.variance)}</td>
                <td className={["px-3 py-2.5 text-end font-mono tabular-nums", varianceTone(r)].join(" ")}>{r.variancePct == null ? "—" : `${r.variancePct > 0 ? "+" : ""}${r.variancePct}%`}</td>
                <td className="px-3 py-2.5 text-center">
                  <button type="button" onClick={() => void remove(r.id)} aria-label={t("remove")}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:bg-danger/10 hover:text-danger">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-[12.5px] text-subtle">{t("empty")}</td></tr>
            )}
          </tbody>
          {report?.rows.length ? (
            <tfoot>
              <tr className="border-t-2 border-line font-bold text-ink">
                <td className="px-3 py-2.5">{t("total")}</td>
                <td className="px-3 py-2.5 text-end font-mono tabular-nums">{fmt(report.totals.budget)}</td>
                <td className="px-3 py-2.5 text-end font-mono tabular-nums">{fmt(report.totals.actual)}</td>
                <td className="px-3 py-2.5 text-end font-mono tabular-nums">{report.totals.variance > 0 ? "+" : ""}{fmt(report.totals.variance)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
