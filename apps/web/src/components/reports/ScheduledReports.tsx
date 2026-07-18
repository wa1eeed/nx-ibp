"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Plus, Trash2, Send, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

interface Schedule { id: string; reportKey: string; frequency: string; recipients: string[]; isActive: boolean; lastSentAt: string | null; nextRunAt: string }
const REPORTS = ["dashboard", "commissions", "bordereau"] as const;
const FREQS = ["weekly", "monthly"] as const;

/** §7.3 — إدارة التقارير المجدولة/بالبريد (تحت صفحة التقارير). */
export function ScheduledReports() {
  const t = useTranslations("reports.scheduled");
  const [rows, setRows] = useState<Schedule[]>([]);
  const [reportKey, setReportKey] = useState<string>("dashboard");
  const [frequency, setFrequency] = useState<string>("monthly");
  const [recipients, setRecipients] = useState("");
  const [error, setError] = useState("");
  const [sentId, setSentId] = useState("");

  const load = useCallback(async () => {
    try { setRows(await api<Schedule[]>("/reports/schedules")); } catch { setError(t("error")); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    setError("");
    const list = recipients.split(/[,\s]+/).map((e) => e.trim()).filter(Boolean);
    if (!list.length) { setError(t("error")); return; }
    try {
      await api("/reports/schedules", { method: "POST", body: JSON.stringify({ reportKey, frequency, recipients: list }) });
      setRecipients("");
      await load();
    } catch (e) { setError((e as Error).message || t("error")); }
  }
  async function toggle(s: Schedule) {
    try { await api(`/reports/schedules/${s.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !s.isActive }) }); await load(); }
    catch (e) { setError((e as Error).message || t("error")); }
  }
  async function sendNow(id: string) {
    setError("");
    try { await api(`/reports/schedules/${id}/run-now`, { method: "POST" }); setSentId(id); setTimeout(() => setSentId((c) => (c === id ? "" : c)), 1500); await load(); }
    catch (e) { setError((e as Error).message || t("error")); }
  }
  async function remove(id: string) {
    try { await api(`/reports/schedules/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setError((e as Error).message || t("error")); }
  }

  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : t("never"));

  return (
    <section className="rounded-card border border-line bg-card shadow-card">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        <CalendarClock size={17} className="text-primary" />
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{t("title")}</h2>
          <p className="text-[11.5px] text-subtle">{t("subtitle")}</p>
        </div>
      </div>

      {/* إنشاء جدول */}
      <div className="flex flex-wrap items-end gap-2.5 border-b border-line px-5 py-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-subtle">{t("reportKey")}</span>
          <select value={reportKey} onChange={(e) => setReportKey(e.target.value)} className="h-9 w-44 rounded-lg border border-line bg-card px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30">
            {REPORTS.map((r) => <option key={r} value={r}>{t(`report.${r}`)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-subtle">{t("frequency")}</span>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="h-9 w-32 rounded-lg border border-line bg-card px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30">
            {FREQS.map((f) => <option key={f} value={f}>{t(`freq.${f}`)}</option>)}
          </select>
        </label>
        <label className="block flex-1 min-w-[200px]">
          <span className="mb-1 block text-[11px] font-medium text-subtle">{t("recipients")}</span>
          <input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder={t("recipientsHint")} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <button type="button" onClick={() => void add()} disabled={!recipients.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-4 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-40">
          <Plus size={15} /> {t("add")}
        </button>
      </div>

      {error ? <p className="mx-5 mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[12px] font-medium text-danger">{error}</p> : null}

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-center text-[12.5px] text-subtle">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">{t(`report.${s.reportKey}`)}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{t(`freq.${s.frequency}`)}</span>
                  {!s.isActive ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-subtle">{t("inactive")}</span> : null}
                </div>
                <div className="mt-0.5 truncate text-[11.5px] text-subtle">{s.recipients.join("، ")}</div>
                <div className="mt-0.5 text-[11px] text-subtle">{t("nextRun")}: {fmtDate(s.nextRunAt)} · {t("lastSent")}: {fmtDate(s.lastSentAt)}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => void sendNow(s.id)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12px] font-medium text-primary hover:bg-surface-2">
                  {sentId === s.id ? <Check size={14} className="text-success" /> : <Send size={14} />} {sentId === s.id ? t("sent") : t("sendNow")}
                </button>
                <button type="button" onClick={() => void toggle(s)} className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-[12px] font-medium text-ink hover:bg-surface-2">
                  {s.isActive ? t("active") : t("inactive")}
                </button>
                <button type="button" onClick={() => void remove(s.id)} aria-label={t("remove")} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:bg-danger/10 hover:text-danger">
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
