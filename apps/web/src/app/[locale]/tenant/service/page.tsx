"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, X, Headset, Send, StickyNote, ArrowRight, UserCheck, Check, Flame } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface SR {
  id: string; sequenceNo: string | null; type: string; subject: string | null; status: string;
  priority: string; assigneeId: string | null; assigneeName: string | null; clientId: string | null; clientName: string | null;
  createdAt: string; updatedAt: string;
}
interface Staff { id: string; fullName: string }
interface Activity { id: string; type: string; body: string; createdAt: string }
interface SRDetail extends SR { policy: { id: string; sequenceNo: string | null } | null; timeline: Activity[] }

const TONE: Record<string, BadgeTone> = { OPEN: "warning", IN_PROGRESS: "info", SENT_TO_INSURER: "info", CLOSED: "success" };
const STATUSES = ["OPEN", "IN_PROGRESS", "SENT_TO_INSURER", "CLOSED"];
const TYPES = ["addition", "deletion", "amendment", "inquiry", "renewal"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const PRIO_TONE: Record<string, string> = { urgent: "bg-danger/10 text-danger", high: "bg-warning-soft text-warning", normal: "bg-surface-2 text-subtle", low: "bg-surface-2 text-subtle" };
const ACT_META: Record<string, { Icon: typeof StickyNote; tone: string }> = {
  note: { Icon: StickyNote, tone: "text-subtle" },
  stage_change: { Icon: ArrowRight, tone: "text-warning" },
};

const daysSince = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 864e5);

export default function ServicePage() {
  const t = useTranslations();
  const router = useRouter();
  const [rows, setRows] = useState<SR[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [mine, setMine] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  // نموذج الإنشاء
  const [type, setType] = useState("amendment");
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState("normal");
  const [assigneeId, setAssigneeId] = useState("");

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (statusFilter) qs.set("status", statusFilter);
    if (mine) qs.set("mine", "1");
    setRows(await api<SR[]>(`/service-requests${qs.toString() ? `?${qs}` : ""}`));
  }, [statusFilter, mine]);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    void load().catch(() => undefined);
    void api<Staff[]>("/service-requests/staff").then(setStaff).catch(() => setStaff([]));
  }, [load, router]);

  async function create(e: FormEvent) {
    e.preventDefault(); setError("");
    try {
      await api("/service-requests", { method: "POST", body: JSON.stringify({ type, subject: subject || undefined, priority, assigneeId: assigneeId || undefined }) });
      setShow(false); setSubject(""); setPriority("normal"); setAssigneeId("");
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "خطأ"); }
  }

  const counts = STATUSES.reduce<Record<string, number>>((a, s) => ({ ...a, [s]: rows.filter((r) => r.status === s).length }), {});

  return (
    <div>
      <PageHeader title={t("service.title")} subtitle={t("service.subtitle")}
        actions={<button onClick={() => setShow((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-fg hover:bg-primary">{show ? <X size={16} /> : <Plus size={16} />}{show ? t("service.cancel") : t("service.new")}</button>} />

      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {show ? (
        <form onSubmit={create} className="mb-4 grid grid-cols-1 gap-3 rounded-card border border-line bg-card p-5 shadow-card sm:grid-cols-5">
          <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{t("service.type")}</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px]">
              {TYPES.map((x) => <option key={x} value={x}>{t(`service.types.${x}`)}</option>)}
            </select></label>
          <label className="block sm:col-span-2"><span className="mb-1 block text-[12px] font-medium text-muted">{t("service.subject")}</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px]" /></label>
          <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{t("service.priority")}</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px]">
              {PRIORITIES.map((p) => <option key={p} value={p}>{t(`service.priorities.${p}`)}</option>)}
            </select></label>
          <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{t("service.assignee")}</span>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px]">
              <option value="">{t("service.unassigned")}</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select></label>
          <div className="flex items-end sm:col-span-5"><button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary">{t("service.create")}</button></div>
        </form>
      ) : null}

      {/* الفلاتر: الحالة + طلباتي */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button onClick={() => setStatusFilter("")} className={["h-8 rounded-lg border px-3 text-[12px] font-medium", statusFilter === "" ? "border-primary bg-primary/10 text-primary" : "border-line text-muted hover:bg-surface-2"].join(" ")}>{t("service.filterAll")}</button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={["inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium", statusFilter === s ? "border-primary bg-primary/10 text-primary" : "border-line text-muted hover:bg-surface-2"].join(" ")}>
            {t(`service.statuses.${s}`)}<span className="rounded-full bg-surface-2 px-1.5 text-[10px] tnum text-subtle">{counts[s] ?? 0}</span>
          </button>
        ))}
        <button onClick={() => setMine((v) => !v)} className={["ms-auto inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium", mine ? "border-primary bg-primary/10 text-primary" : "border-line text-muted hover:bg-surface-2"].join(" ")}>
          <UserCheck size={13} /> {t("service.mine")}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="grid min-h-[40vh] place-items-center rounded-card border border-dashed border-line bg-card text-center shadow-card text-muted"><div><Headset size={28} className="mx-auto mb-2 text-subtle" /><p className="text-[13px]">{t("service.empty")}</p></div></div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("service.col.seq")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("service.col.type")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("service.col.subject")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("service.col.client")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("service.col.priority")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("service.col.assignee")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("service.col.status")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("service.col.age")}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const age = daysSince(r.createdAt);
                const stale = r.status !== "CLOSED" && age >= 3;
                return (
                  <tr key={r.id} onClick={() => setDetailId(r.id)} className="cursor-pointer hover:bg-surface-2/60">
                    <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{r.sequenceNo ?? "—"}</td>
                    <td className="px-4 py-3 text-[13px] text-muted">{t(`service.types.${r.type}`)}</td>
                    <td className="px-4 py-3 text-[13px] text-ink">{r.subject ?? "—"}</td>
                    <td className="px-4 py-3 text-[12.5px] text-muted">{r.clientName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={["inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", PRIO_TONE[r.priority]].join(" ")}>
                        {r.priority === "urgent" ? <Flame size={11} /> : null}{t(`service.priorities.${r.priority}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12.5px]">{r.assigneeName ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{r.assigneeName}</span> : <span className="text-subtle">{t("service.unassigned")}</span>}</td>
                    <td className="px-4 py-3"><Badge tone={TONE[r.status] ?? "neutral"}>{t(`service.statuses.${r.status}`)}</Badge></td>
                    <td className={["px-4 py-3 text-[12px] tnum", stale ? "font-semibold text-danger" : "text-subtle"].join(" ")}>{age === 0 ? t("service.today") : t("service.daysAgo", { n: age })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {detailId ? <ServiceDetail id={detailId} staff={staff} onClose={() => setDetailId(null)} onChanged={() => void load()} /> : null}
    </div>
  );
}

function ServiceDetail({ id, staff, onClose, onChanged }: { id: string; staff: Staff[]; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations();
  const [d, setD] = useState<SRDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(() => { void api<SRDetail>(`/service-requests/${id}`).then(setD).catch(() => undefined); }, [id]);
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setErr("");
    try { await fn(); load(); onChanged(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); }
    finally { setBusy(false); }
  }
  const setStatus = (status: string) => act(() => api(`/service-requests/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }));
  const setPriority = (priority: string) => act(() => api(`/service-requests/${id}/priority`, { method: "POST", body: JSON.stringify({ priority }) }));
  const assign = (assigneeId: string) => act(() => api(`/service-requests/${id}/assign`, { method: "POST", body: JSON.stringify({ assigneeId: assigneeId || null }) }));
  async function addNote() {
    if (note.trim().length < 1) return;
    await act(() => api(`/service-requests/${id}/notes`, { method: "POST", body: JSON.stringify({ body: note.trim() }) }));
    setNote("");
  }

  const field = "h-9 w-full rounded-lg border border-line bg-card px-2 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        {!d ? <p className="py-8 text-center text-subtle">…</p> : (
          <>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-[16px] font-bold text-ink">{d.sequenceNo ?? "—"} · {t(`service.types.${d.type}`)}</h2>
                <p className="text-[12px] text-subtle">{d.subject ?? "—"}{d.clientName ? ` · ${d.clientName}` : ""}{d.policy?.sequenceNo ? ` · ${d.policy.sequenceNo}` : ""}</p>
              </div>
              <button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button>
            </div>
            {err ? <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-[12px] font-medium text-danger">{err}</p> : null}

            {/* الإجراءات: الحالة · الأولوية · الإسناد */}
            <div className="mb-4 grid grid-cols-1 gap-3 rounded-card border border-line bg-surface-2/30 p-3 sm:grid-cols-3">
              <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("service.col.status")}</span>
                <select value={d.status} onChange={(e) => setStatus(e.target.value)} disabled={busy} className={field}>{STATUSES.map((s) => <option key={s} value={s}>{t(`service.statuses.${s}`)}</option>)}</select></label>
              <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("service.priority")}</span>
                <select value={d.priority} onChange={(e) => setPriority(e.target.value)} disabled={busy} className={field}>{PRIORITIES.map((p) => <option key={p} value={p}>{t(`service.priorities.${p}`)}</option>)}</select></label>
              <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("service.assignee")}</span>
                <select value={d.assigneeId ?? ""} onChange={(e) => assign(e.target.value)} disabled={busy} className={field}><option value="">{t("service.unassigned")}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</select></label>
            </div>

            {/* مُدوِّن الملاحظات */}
            <div className="mb-4 flex items-end gap-2">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("service.notePlaceholder")} rows={2} className="min-h-[38px] flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <button onClick={addNote} disabled={busy || note.trim().length < 1} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"><Send size={13} /> {t("service.logNote")}</button>
            </div>

            {/* الخطّ الزمني */}
            {d.timeline?.length ? (
              <div><p className="mb-1.5 text-[12px] font-semibold text-subtle">{t("service.timeline")}</p>
                <ol className="space-y-1.5">{d.timeline.map((a) => {
                  const meta = ACT_META[a.type] ?? ACT_META.note;
                  return (
                    <li key={a.id} className="flex items-start justify-between gap-2 rounded-lg bg-surface-2/40 px-3 py-2">
                      <span className="flex min-w-0 items-start gap-2"><meta.Icon size={13} className={`mt-0.5 shrink-0 ${meta.tone}`} /><span className="text-[12px] text-ink">{a.body}</span></span>
                      <span className="shrink-0 text-[10.5px] text-subtle tnum">{new Date(a.createdAt).toLocaleDateString("en-GB")}</span>
                    </li>
                  );
                })}</ol>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
