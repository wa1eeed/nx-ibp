"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, MessageSquareWarning, ShieldAlert, CheckCircle2, Send, Clock, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api, ApiError, getToken } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";

interface Note { id: string; body: string; createdAt: string; authorName: string }
interface Detail {
  id: string; sequenceNo: string | null; category: string; source: string; subject: string; description: string;
  status: string; priority: string; clientName: string | null; assigneeName: string | null; dueDate: string | null;
  overdue: boolean; escalated: boolean; resolution: string | null; resolvedAt: string | null; createdAt: string; notes: Note[];
}

const STATUSES = ["open", "investigating", "resolved", "escalated", "closed"] as const;
const stTone: Record<string, "success" | "info" | "danger" | "warning" | "neutral"> = { open: "warning", investigating: "info", resolved: "success", escalated: "danger", closed: "neutral" };

export default function ComplaintDetailPage() {
  const t = useTranslations("complaints");
  const params = useParams();
  const id = String(params.id);
  const [c, setC] = useState<Detail | null>(null);
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [showResolve, setShowResolve] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => { try { setC(await api<Detail>(`/complaints/${id}`)); } catch { /* ignore */ } }, [id]);
  useEffect(() => { if (getToken()) void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => { setErr(""); try { await fn(); await load(); } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); } };
  const setStatus = (status: string) => run(() => api(`/complaints/${id}`, { method: "PUT", body: JSON.stringify({ status }) }));
  const escalate = () => run(() => api(`/complaints/${id}/escalate`, { method: "POST", body: JSON.stringify({}) }));
  const resolve = () => run(async () => { await api(`/complaints/${id}/resolve`, { method: "POST", body: JSON.stringify({ resolution: resolution.trim() }) }); setShowResolve(false); setResolution(""); });
  const addNote = () => { if (!note.trim()) return; void run(async () => { await api(`/complaints/${id}/notes`, { method: "POST", body: JSON.stringify({ body: note.trim() }) }); setNote(""); }); };

  const dt = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB") : "—");
  if (!c) return <div className="grid min-h-[40vh] place-items-center text-subtle">…</div>;
  const done = c.status === "resolved" || c.status === "closed";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/tenant/complaints" className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink"><ArrowRight size={14} className="rotate-180" /> {t("back")}</Link>

      <div className="rounded-card border border-line bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-warning-soft text-warning"><MessageSquareWarning size={20} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[16px] font-bold text-ink">{c.subject}</h1>
              <Badge tone={stTone[c.status] ?? "neutral"}>{t(`status.${c.status}`)}</Badge>
              {c.escalated ? <Badge tone="danger">{t("escalatedTag")}</Badge> : null}
              {c.overdue ? <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-danger"><AlertTriangle size={12} /> {t("overdueTag")}</span> : null}
            </div>
            <p className="text-[12px] text-subtle tnum">{c.sequenceNo} · {t(`category.${c.category}`)} · {t(`sourceOpt.${c.source}`)}</p>
          </div>
        </div>
        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-2/50 px-3 py-2.5 text-[13px] text-ink">{c.description}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
          <div><span className="text-subtle">{t("meta.client")}</span><div className="font-medium text-ink">{c.clientName ?? "—"}</div></div>
          <div><span className="text-subtle">{t("meta.priority")}</span><div className="font-medium text-ink">{t(`priority.${c.priority}`)}</div></div>
          <div><span className="text-subtle">{t("meta.due")}</span><div className={`font-medium tnum ${c.overdue ? "text-danger" : "text-ink"}`}>{c.dueDate ? new Date(c.dueDate).toLocaleDateString("en-GB") : "—"}</div></div>
          <div><span className="text-subtle">{t("meta.created")}</span><div className="font-medium text-ink tnum">{new Date(c.createdAt).toLocaleDateString("en-GB")}</div></div>
        </div>
        {c.resolution ? <div className="mt-3 rounded-lg bg-success-soft/40 px-3 py-2.5"><p className="text-[11.5px] font-semibold text-success">{t("resolutionLabel")} · {dt(c.resolvedAt)}</p><p className="mt-0.5 text-[12.5px] text-ink">{c.resolution}</p></div> : null}
      </div>

      {/* الإجراءات */}
      {!done ? (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-card p-4 shadow-card">
          <span className="text-[12px] font-medium text-subtle">{t("actions")}:</span>
          {c.status === "open" ? <button onClick={() => setStatus("investigating")} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2"><Clock size={13} /> {t("startInvestigation")}</button> : null}
          <button onClick={() => setShowResolve((v) => !v)} className="inline-flex items-center gap-1 rounded-lg bg-success/10 px-2.5 py-1.5 text-[12px] font-medium text-success hover:bg-success/20"><CheckCircle2 size={13} /> {t("resolve")}</button>
          {!c.escalated ? <button onClick={escalate} className="inline-flex items-center gap-1 rounded-lg bg-danger/10 px-2.5 py-1.5 text-[12px] font-medium text-danger hover:bg-danger/20"><ShieldAlert size={13} /> {t("escalate")}</button> : null}
          <select value={c.status} onChange={(e) => setStatus(e.target.value)} className="ms-auto h-8 rounded-lg border border-line bg-card px-2 text-[12px] text-ink">{STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</select>
        </div>
      ) : null}
      {showResolve ? (
        <div className="rounded-card border border-line bg-card p-4 shadow-card">
          <label className="mb-1 block text-[12px] font-medium text-muted">{t("resolutionLabel")}</label>
          <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="mt-2 flex justify-end"><button onClick={resolve} disabled={resolution.trim().length < 3} className="h-9 rounded-lg bg-success px-4 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60">{t("confirmResolve")}</button></div>
        </div>
      ) : null}
      {err ? <p className="rounded-lg bg-danger-soft/50 px-3 py-2 text-[12px] font-medium text-danger">{err}</p> : null}

      {/* الخط الزمني (ملاحظات داخلية) */}
      <div className="rounded-card border border-line bg-card p-4 shadow-card">
        <h2 className="mb-2 text-[13.5px] font-semibold text-ink">{t("timeline")}</h2>
        <div className="mb-3 flex items-center gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} placeholder={t("addNote")} className="h-9 flex-1 rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <button onClick={addNote} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-semibold text-white hover:opacity-90"><Send size={14} /> {t("addBtn")}</button>
        </div>
        {c.notes.length === 0 ? <p className="text-[12.5px] text-subtle">{t("noNotes")}</p> : (
          <ol className="relative space-y-3 border-s-2 border-line ps-4">
            {c.notes.map((n) => (
              <li key={n.id} className="relative">
                <span className="absolute -start-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card" />
                <div className="flex items-center justify-between gap-2"><span className="text-[12.5px] text-ink">{n.body}</span><span className="shrink-0 text-[11px] text-subtle tnum">{n.authorName} · {new Date(n.createdAt).toLocaleDateString("en-GB")}</span></div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
