"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareWarning, Plus, X, AlertTriangle, ShieldAlert, CheckCircle2, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { usePaged, Pagination } from "@/components/ui/Pagination";

interface Row { id: string; sequenceNo: string | null; category: string; source: string; subject: string; status: string; priority: string; clientName: string | null; dueDate: string | null; overdue: boolean; escalated: boolean; createdAt: string }
interface Report { total: number; byStatus: Record<string, number>; escalated: number; overdue: number; slaCompliancePct: number; avgResolutionDays: number; resolutionRatePct: number; slaDays: number }

const CATEGORIES = ["pricing", "claims", "service", "sales_conduct", "billing", "data_privacy", "other"] as const;
const SOURCES = ["phone", "email", "portal", "walk_in", "regulator", "social"] as const;
const STATUSES = ["open", "investigating", "resolved", "escalated", "closed"] as const;
const stTone: Record<string, "success" | "info" | "danger" | "warning" | "neutral"> = { open: "warning", investigating: "info", resolved: "success", escalated: "danger", closed: "neutral" };
const prTone: Record<string, "danger" | "warning" | "neutral"> = { urgent: "danger", high: "warning", normal: "neutral", low: "neutral" };

export default function ComplaintsPage() {
  const t = useTranslations("complaints");
  const [rows, setRows] = useState<Row[]>([]);
  const [rep, setRep] = useState<Report | null>(null);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (category) qs.set("category", category);
    const q = qs.toString();
    void api<Row[]>(`/complaints${q ? `?${q}` : ""}`).then(setRows).catch(() => setRows([]));
    void api<Report>("/complaints/report").then(setRep).catch(() => undefined);
  }, [status, category]);
  useEffect(() => { load(); }, [load]);

  const page = usePaged(rows);
  const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB") : "—");
  const selCls = "h-9 rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={<button onClick={() => setShowNew(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary"><Plus size={16} /> {t("new")}</button>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard tone="primary" icon={<MessageSquareWarning size={18} />} title={t("kpi.total")} value={rep?.total ?? "…"} />
        <StatCard tone="warning" icon={<Clock size={18} />} title={t("kpi.open")} value={rep ? (rep.byStatus.open ?? 0) + (rep.byStatus.investigating ?? 0) : "…"} />
        <StatCard tone="danger" icon={<AlertTriangle size={18} />} title={t("kpi.overdue")} value={rep?.overdue ?? "…"} sub={rep ? t("kpi.slaWindow", { d: rep.slaDays }) : ""} />
        <StatCard tone="danger" icon={<ShieldAlert size={18} />} title={t("kpi.escalated")} value={rep?.escalated ?? "…"} />
        <StatCard tone="success" icon={<CheckCircle2 size={18} />} title={t("kpi.sla")} value={rep ? `${rep.slaCompliancePct}%` : "…"} sub={rep ? t("kpi.avgDays", { d: rep.avgResolutionDays }) : ""} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selCls}><option value="">{t("filter.allStatus")}</option>{STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selCls}><option value="">{t("filter.allCategory")}</option>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`category.${c}`)}</option>)}</select>
      </div>

      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("col.no")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("col.subject")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("col.category")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("col.client")}</th>
              <th className="px-4 py-3 text-center font-semibold">{t("col.due")}</th>
              <th className="px-4 py-3 text-center font-semibold">{t("col.priority")}</th>
              <th className="px-4 py-3 text-center font-semibold">{t("col.status")}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {page.pageItems.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[12.5px] font-medium tnum"><Link href={`/tenant/complaints/${r.id}`} className="text-primary hover:underline">{r.sequenceNo ?? r.id.slice(0, 8)}</Link></td>
                  <td className="px-4 py-3 text-[13px] text-ink">{r.subject}</td>
                  <td className="px-4 py-3 text-[12.5px] text-muted">{t(`category.${r.category}`)}</td>
                  <td className="px-4 py-3 text-[12.5px] text-muted">{r.clientName ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-[12px] tnum">{r.overdue ? <span className="font-semibold text-danger">{dt(r.dueDate)}</span> : <span className="text-subtle">{dt(r.dueDate)}</span>}</td>
                  <td className="px-4 py-3 text-center"><Badge tone={prTone[r.priority] ?? "neutral"}>{t(`priority.${r.priority}`)}</Badge></td>
                  <td className="px-4 py-3 text-center"><Badge tone={stTone[r.status] ?? "neutral"}>{t(`status.${r.status}`)}</Badge></td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-10 text-center text-[13px] text-subtle">{t("empty")}</td></tr> : null}
            </tbody>
          </table>
        </div>
        <Pagination page={page.page} pageCount={page.pageCount} total={page.total} from={page.from} to={page.to} onPage={page.setPage} />
      </section>

      {showNew ? <NewComplaint onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load(); }} /> : null}
    </div>
  );
}

function NewComplaint({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useTranslations("complaints");
  const [category, setCategory] = useState("service");
  const [source, setSource] = useState("phone");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const field = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  async function save() {
    setErr(""); setSaving(true);
    try { await api("/complaints", { method: "POST", body: JSON.stringify({ category, source, subject: subject.trim(), description: description.trim(), priority }) }); onDone(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("newTitle")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("col.category")}</span><select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`category.${c}`)}</option>)}</select></label>
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("source")}</span><select value={source} onChange={(e) => setSource(e.target.value)} className={field}>{SOURCES.map((s) => <option key={s} value={s}>{t(`sourceOpt.${s}`)}</option>)}</select></label>
          </div>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("col.subject")}</span><input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} /></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("description")}</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" /></label>
          <label className="block sm:w-40"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("col.priority")}</span><select value={priority} onChange={(e) => setPriority(e.target.value)} className={field}>{["urgent", "high", "normal", "low"].map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}</select></label>
          {err ? <p className="text-[12px] font-medium text-danger">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("cancel")}</button>
            <button onClick={save} disabled={saving || subject.trim().length < 3 || description.trim().length < 3} className="h-9 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">{saving ? "…" : t("save")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
