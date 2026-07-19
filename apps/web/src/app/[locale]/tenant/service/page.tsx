"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, X, Headset, UserCheck, Flame } from "lucide-react";
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

const TONE: Record<string, BadgeTone> = { OPEN: "warning", IN_PROGRESS: "info", SENT_TO_INSURER: "info", CLOSED: "success" };
const STATUSES = ["OPEN", "IN_PROGRESS", "SENT_TO_INSURER", "CLOSED"];
const TYPES = ["addition", "deletion", "amendment", "inquiry", "renewal"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const PRIO_TONE: Record<string, string> = { urgent: "bg-danger/10 text-danger", high: "bg-warning-soft text-warning", normal: "bg-surface-2 text-subtle", low: "bg-surface-2 text-subtle" };

const daysSince = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 864e5);

export default function ServicePage() {
  const t = useTranslations();
  const router = useRouter();
  const [allRows, setAllRows] = useState<SR[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [mine, setMine] = useState(false);
  // نموذج الإنشاء
  const [type, setType] = useState("amendment");
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState("normal");
  const [assigneeId, setAssigneeId] = useState("");

  // نجلب المجموعة كاملةً ضمن نطاق «طلباتي» فقط — لا نُرشِّح بالحالة على الخادم كي تبقى
  // أعداد التابز ثابتةً وصحيحةً عبر كل الحالات؛ ترشيح الحالة يتمّ على العميل (انظر rows أدناه).
  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (mine) qs.set("mine", "1");
    setAllRows(await api<SR[]>(`/service-requests${qs.toString() ? `?${qs}` : ""}`));
  }, [mine]);

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

  // الأعداد محسوبة من المجموعة الكاملة (مستقلّة عن التاب المختار) — فلا تتغيّر عند التنقّل.
  const counts = STATUSES.reduce<Record<string, number>>((a, s) => ({ ...a, [s]: allRows.filter((r) => r.status === s).length }), {});
  // الصفوف المعروضة: ترشيح المجموعة الكاملة بالحالة على العميل.
  const rows = statusFilter ? allRows.filter((r) => r.status === statusFilter) : allRows;

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
        <button onClick={() => { setStatusFilter(""); setMine(false); }} className={["inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium", statusFilter === "" && !mine ? "border-primary bg-primary/10 text-primary" : "border-line text-muted hover:bg-surface-2"].join(" ")}>{t("service.filterAll")}<span className="rounded-full bg-surface-2 px-1.5 text-[10px] tnum text-subtle">{allRows.length}</span></button>
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
                  <tr key={r.id} onClick={() => router.push(`/tenant/service/${r.id}`)} className="cursor-pointer hover:bg-surface-2/60">
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
    </div>
  );
}
