"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Plus, Check, X, ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { Link } from "@/i18n/routing";
import { PageHeader } from "@/components/ui/PageHeader";

interface Leave { id: string; userId: string; employeeName: string; type: string; startDate: string; endDate: string; days: number; reason: string | null; status: string; decisionNote: string | null }
const TYPES = ["annual", "sick", "unpaid", "other"] as const;

const tone: Record<string, string> = { pending: "bg-warning/10 text-warning", approved: "bg-success/10 text-success", rejected: "bg-danger/10 text-danger" };

/** §8.2 — طلبات الإجازات: تقديم الموظف طلباته + بتّ الإدارة (settings). */
export default function LeavePage() {
  const t = useTranslations("leave");
  const [mine, setMine] = useState<Leave[]>([]);
  const [all, setAll] = useState<Leave[] | null>(null); // null = ليس مديرًا (403)
  const [type, setType] = useState<string>("annual");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setMine(await api<Leave[]>("/leave/mine")); } catch { /* */ }
    try { setAll(await api<Leave[]>("/leave")); } catch { setAll(null); } // 403 لغير الإدارة
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit() {
    setError("");
    if (!startDate || !endDate) { setError(t("error")); return; }
    try { await api("/leave", { method: "POST", body: JSON.stringify({ type, startDate, endDate, reason: reason.trim() || undefined }) }); setReason(""); await load(); }
    catch (e) { setError((e as Error).message || t("error")); }
  }
  async function decide(id: string, status: "approved" | "rejected") {
    setError("");
    try { await api(`/leave/${id}/decide`, { method: "POST", body: JSON.stringify({ status }) }); await load(); }
    catch (e) { setError((e as Error).message || t("error")); }
  }

  const Row = (l: Leave, manage: boolean) => (
    <tr key={l.id} className="border-b border-line/60 last:border-0">
      {manage ? <td className="px-3 py-2.5 font-medium text-ink">{l.employeeName}</td> : null}
      <td className="px-3 py-2.5">{t(`type.${l.type}`)}</td>
      <td className="px-3 py-2.5 text-[12px] text-subtle">{l.startDate} → {l.endDate}</td>
      <td className="px-3 py-2.5 text-center tabular-nums">{l.days}</td>
      <td className="px-3 py-2.5"><span className={["rounded-full px-2 py-0.5 text-[11px] font-medium", tone[l.status]].join(" ")}>{t(`status.${l.status}`)}</span></td>
      {manage ? (
        <td className="px-3 py-2.5 text-center">
          {l.status === "pending" ? (
            <div className="flex items-center justify-center gap-1.5">
              <button type="button" onClick={() => void decide(l.id, "approved")} aria-label={t("approve")} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-success hover:bg-success/10"><Check size={14} /></button>
              <button type="button" onClick={() => void decide(l.id, "rejected")} aria-label={t("reject")} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-danger hover:bg-danger/10"><X size={14} /></button>
            </div>
          ) : <span className="text-[11px] text-subtle">—</span>}
        </td>
      ) : null}
    </tr>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={
        <Link href="/tenant/settings/staff" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 text-[13px] font-medium text-primary hover:bg-surface-2"><ChevronLeft size={15} className="rtl:rotate-180" /> {t("backToStaff")}</Link>
      } />
      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {/* تقديم طلب */}
      <section className="rounded-card border border-line bg-card p-4">
        <div className="mb-3 flex items-center gap-2"><CalendarDays size={17} className="text-primary" /><h2 className="text-[14px] font-bold text-ink">{t("submit")}</h2></div>
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="block"><span className="mb-1 block text-[11px] font-medium text-subtle">{t("type.label")}</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-36 rounded-lg border border-line bg-card px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30">
              {TYPES.map((x) => <option key={x} value={x}>{t(`type.${x}`)}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-[11px] font-medium text-subtle">{t("from")}</span><input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className="h-9 rounded-lg border border-line bg-card px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" /></label>
          <label className="block"><span className="mb-1 block text-[11px] font-medium text-subtle">{t("to")}</span><input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} className="h-9 rounded-lg border border-line bg-card px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" /></label>
          <label className="block flex-1 min-w-[160px]"><span className="mb-1 block text-[11px] font-medium text-subtle">{t("reason")}</span><input value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" /></label>
          <button type="button" onClick={() => void submit()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-4 text-[12.5px] font-semibold text-white hover:opacity-90"><Plus size={15} /> {t("send")}</button>
        </div>
      </section>

      {/* طلباتي */}
      <section className="overflow-hidden rounded-card border border-line bg-card">
        <div className="border-b border-line px-4 py-3"><h2 className="text-[14px] font-bold text-ink">{t("myRequests")}</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[12.5px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle"><th className="px-3 py-2 text-start">{t("type.label")}</th><th className="px-3 py-2 text-start">{t("dates")}</th><th className="px-3 py-2 text-center">{t("days")}</th><th className="px-3 py-2 text-start">{t("status.label")}</th></tr></thead>
            <tbody>{mine.length ? mine.map((l) => Row(l, false)) : <tr><td colSpan={4} className="px-3 py-6 text-center text-subtle">{t("empty")}</td></tr>}</tbody>
          </table>
        </div>
      </section>

      {/* إدارة الطلبات (للإدارة فقط) */}
      {all !== null ? (
        <section className="overflow-hidden rounded-card border border-line bg-card">
          <div className="border-b border-line px-4 py-3"><h2 className="text-[14px] font-bold text-ink">{t("manage")}</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle"><th className="px-3 py-2 text-start">{t("employee")}</th><th className="px-3 py-2 text-start">{t("type.label")}</th><th className="px-3 py-2 text-start">{t("dates")}</th><th className="px-3 py-2 text-center">{t("days")}</th><th className="px-3 py-2 text-start">{t("status.label")}</th><th className="px-3 py-2" /></tr></thead>
              <tbody>{all.length ? all.map((l) => Row(l, true)) : <tr><td colSpan={6} className="px-3 py-6 text-center text-subtle">{t("empty")}</td></tr>}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
