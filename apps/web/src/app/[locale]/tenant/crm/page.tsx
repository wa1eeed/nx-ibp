"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Check, Trophy, X, CalendarClock, RefreshCw, FileText, ClipboardList, Percent, AlarmClock, ArrowRightLeft, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError, getToken } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Deal { id: string; title: string; stage: string; status: string; value: string | null; productLineCode: string | null; estimatedPremium: string | null; exclusivity: string | null; requestId: string | null; clientId: string | null; clientName: string | null; assigneeId: string | null; assigneeName: string | null }
interface Task { id: string; title: string; dueDate: string | null; priority: string; assigneeId: string | null }
interface Client { id: string; name: string }
interface Staff { id: string; fullName: string }
interface CatalogClass { code: string; name: string; lines: Array<{ code: string; name: string }> }
interface FollowUp { expiringPolicies: { count: number }; openRequests: number; activeClaims: number | null; unpaidCommissions: { count: number; total: number } | null; overdueTasks: number }

const STAGES = ["new", "contacted", "quoting", "proposal", "negotiation"] as const;
const PRIO_TONE: Record<string, string> = { high: "bg-danger/10 text-danger", normal: "bg-surface-2 text-subtle", low: "bg-surface-2 text-subtle" };

export default function CrmPage() {
  const t = useTranslations("crm");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [mineOnly, setMineOnly] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [fu, setFu] = useState<FollowUp | null>(null);
  const [catalog, setCatalog] = useState<CatalogClass[]>([]);
  const [dealForm, setDealForm] = useState<{ title: string; clientId: string; value: string; productLineCode: string; assigneeId: string } | null>(null);
  const [taskForm, setTaskForm] = useState<{ title: string; assigneeId: string; dueDate: string; priority: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [d, tk, c, s, cat] = await Promise.all([
        api<Deal[]>("/crm/deals"),
        api<Task[]>(`/crm/tasks${mineOnly ? "?mine=1" : ""}`),
        api<Client[]>("/clients").catch(() => [] as Client[]),
        api<Staff[]>("/staff").catch(() => [] as Staff[]),
        api<CatalogClass[]>("/catalog").catch(() => [] as CatalogClass[]),
      ]);
      setDeals(d); setTasks(tk); setClients(c); setStaff(s); setCatalog(cat);
    } catch { setError(t("error")); }
    try { setFu(await api<FollowUp>("/crm/follow-up")); } catch { /* تجاهل */ }
  }, [mineOnly, t]);
  useEffect(() => { if (getToken()) void load(); }, [load]);

  // المدير (صلاحية حذف على المبيعات) يرى الكل ويملك مبدّل «مهامّي/الكل»؛ المندوب يرى ما أُسنِد إليه
  useEffect(() => {
    if (!getToken()) return;
    void api<{ permissions?: Record<string, { delete?: boolean }> }>("/auth/me")
      .then((me) => setIsManager(me.permissions?.sales?.delete === true))
      .catch(() => undefined);
  }, []);

  const run = async (p: Promise<unknown>) => { setError(""); try { await p; await load(); } catch { setError(t("error")); } };
  const moveDeal = (id: string, stage: string) => run(api(`/crm/deals/${id}`, { method: "PATCH", body: JSON.stringify({ stage }) }));
  const setStatus = (id: string, status: string) => run(api(`/crm/deals/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }));
  const completeTask = (id: string) => run(api(`/crm/tasks/${id}/complete`, { method: "POST" }));

  async function submitDeal() {
    if (!dealForm?.title.trim()) return;
    await run(api("/crm/deals", { method: "POST", body: JSON.stringify({ title: dealForm.title.trim(), clientId: dealForm.clientId || undefined, value: dealForm.value ? Number(dealForm.value) : undefined, productLineCode: dealForm.productLineCode || undefined, assigneeId: dealForm.assigneeId || undefined }) }));
    setDealForm(null);
  }
  const lineName = (code: string | null) => catalog.flatMap((c) => c.lines).find((l) => l.code === code)?.name ?? code ?? null;
  async function submitTask() {
    if (!taskForm?.title.trim()) return;
    await run(api("/crm/tasks", { method: "POST", body: JSON.stringify({ title: taskForm.title.trim(), assigneeId: taskForm.assigneeId || undefined, dueDate: taskForm.dueDate || undefined, priority: taskForm.priority }) }));
    setTaskForm(null);
  }

  const fmt = (n: string | null) => (n == null ? null : Number(n).toLocaleString("en-US"));

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {error ? <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {/* يحتاج متابعة — عابر للوحدات، يحترم الصلاحيات */}
      {fu ? (
        <div className="mb-4">
          <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-subtle">{t("followUp")}</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {([
              { k: "expiring", v: fu.expiringPolicies.count, Icon: RefreshCw, tone: "text-warning" },
              { k: "requests", v: fu.openRequests, Icon: FileText, tone: "text-primary" },
              ...(fu.activeClaims != null ? [{ k: "claims", v: fu.activeClaims, Icon: ClipboardList, tone: "text-info" }] : []),
              ...(fu.unpaidCommissions != null ? [{ k: "commissions", v: fu.unpaidCommissions.count, Icon: Percent, tone: "text-danger" }] : []),
              { k: "overdue", v: fu.overdueTasks, Icon: AlarmClock, tone: fu.overdueTasks > 0 ? "text-danger" : "text-subtle" },
            ] as const).map((card) => (
              <div key={card.k} className="rounded-card border border-line bg-card p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-subtle">{t(`fu.${card.k}`)}</span>
                  <card.Icon size={14} className={card.tone} />
                </div>
                <div className="mt-1 text-[19px] font-bold text-ink tnum">{card.v}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        {/* خطّ الأنابيب */}
        <section className="min-w-0">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[13.5px] font-bold text-ink">{t("pipeline")}</h2>
            <button onClick={() => setDealForm({ title: "", clientId: "", value: "", productLineCode: "", assigneeId: "" })} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-semibold text-white hover:opacity-90">
              <Plus size={14} /> {t("newDeal")}
            </button>
          </div>

          {dealForm ? (
            <div className="mb-3 space-y-2 rounded-card border border-line bg-card p-3">
              <input autoFocus value={dealForm.title} onChange={(e) => setDealForm({ ...dealForm, title: e.target.value })} placeholder={t("dealTitle")} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select value={dealForm.clientId} onChange={(e) => setDealForm({ ...dealForm, clientId: e.target.value })} className="h-9 rounded-lg border border-line bg-card px-2 text-[12.5px] text-ink">
                  <option value="">{t("optionalClient")}</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={dealForm.productLineCode} onChange={(e) => setDealForm({ ...dealForm, productLineCode: e.target.value })} className="h-9 rounded-lg border border-line bg-card px-2 text-[12.5px] text-ink">
                  <option value="">{t("optionalProduct")}</option>
                  {catalog.map((cls) => <optgroup key={cls.code} label={cls.name}>{cls.lines.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</optgroup>)}
                </select>
                <input value={dealForm.value} onChange={(e) => setDealForm({ ...dealForm, value: e.target.value })} placeholder={t("value")} type="number" className="h-9 rounded-lg border border-line bg-card px-3 text-[12.5px] text-ink" />
                <select value={dealForm.assigneeId} onChange={(e) => setDealForm({ ...dealForm, assigneeId: e.target.value })} className="h-9 rounded-lg border border-line bg-card px-2 text-[12.5px] text-ink">
                  <option value="">{t("unassigned")}</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setDealForm(null)} className="h-8 rounded-lg border border-line px-3 text-[12px] text-muted hover:bg-surface-2">{t("cancel")}</button>
                <button onClick={() => void submitDeal()} className="h-8 rounded-lg bg-primary-strong px-3 text-[12px] font-semibold text-primary-fg hover:bg-primary">{t("add")}</button>
              </div>
            </div>
          ) : null}

          <div className="flex gap-3 overflow-x-auto pb-2">
            {STAGES.map((stage) => {
              const col = deals.filter((d) => d.stage === stage);
              return (
                <div key={stage} className="w-64 shrink-0">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-[12.5px] font-bold text-ink">{t(`stages.${stage}`)}</span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-subtle">{col.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.length === 0 ? <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-subtle">{t("emptyDeals")}</p> : null}
                    {col.map((d) => (
                      <div key={d.id} className="rounded-card border border-line bg-card p-3 shadow-sm">
                        <button onClick={() => setDetailId(d.id)} className="block w-full text-start text-[13px] font-semibold text-ink hover:text-primary">{d.title}</button>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-subtle">
                          {d.clientName ? <span>{d.clientName}</span> : null}
                          {d.productLineCode ? <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{lineName(d.productLineCode)}</span> : null}
                          {d.requestId ? <span className="inline-flex items-center gap-0.5 rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success"><ArrowRightLeft size={9} /> {t("converted")}</span> : null}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          {d.estimatedPremium || d.value ? <span className="text-[12px] font-bold text-primary tnum">{fmt(d.estimatedPremium ?? d.value)}</span> : <span />}
                          {d.assigneeName ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-primary">{d.assigneeName}</span> : null}
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-2">
                          <select value={d.stage} onChange={(e) => void moveDeal(d.id, e.target.value)} className="h-7 flex-1 rounded-md border border-line bg-card px-1.5 text-[11.5px] text-ink">
                            {STAGES.map((s) => <option key={s} value={s}>{t(`stages.${s}`)}</option>)}
                          </select>
                          <button title={t("markWon")} onClick={() => void setStatus(d.id, "won")} className="grid h-7 w-7 place-items-center rounded-md border border-line text-success hover:bg-success/10"><Trophy size={13} /></button>
                          <button title={t("markLost")} onClick={() => void setStatus(d.id, "lost")} className="grid h-7 w-7 place-items-center rounded-md border border-line text-muted hover:bg-danger/10 hover:text-danger"><X size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* المهام والتذكيرات */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[13.5px] font-bold text-ink">{t("tasks")}</h2>
            <div className="flex items-center gap-1.5">
              {isManager ? (
                <button onClick={() => setMineOnly((v) => !v)} className={["h-8 rounded-lg border px-2.5 text-[11.5px] font-medium", mineOnly ? "border-primary bg-primary/10 text-primary" : "border-line text-muted hover:bg-surface-2"].join(" ")}>{mineOnly ? t("myTasks") : t("allTasks")}</button>
              ) : null}
              <button onClick={() => setTaskForm({ title: "", assigneeId: "", dueDate: "", priority: "normal" })} className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-white hover:opacity-90"><Plus size={14} /></button>
            </div>
          </div>

          {taskForm ? (
            <div className="mb-3 space-y-2 rounded-card border border-line bg-card p-3">
              <input autoFocus value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder={t("taskTitle")} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <div className="grid grid-cols-2 gap-2">
                <select value={taskForm.assigneeId} onChange={(e) => setTaskForm({ ...taskForm, assigneeId: e.target.value })} className="h-9 rounded-lg border border-line bg-card px-2 text-[12px] text-ink">
                  <option value="">{t("unassigned")}</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                </select>
                <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })} className="h-9 rounded-lg border border-line bg-card px-2 text-[12px] text-ink">
                  {(["low", "normal", "high"] as const).map((p) => <option key={p} value={p}>{t(`priorities.${p}`)}</option>)}
                </select>
              </div>
              <input value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} type="date" className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[12px] text-ink" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setTaskForm(null)} className="h-8 rounded-lg border border-line px-3 text-[12px] text-muted hover:bg-surface-2">{t("cancel")}</button>
                <button onClick={() => void submitTask()} className="h-8 rounded-lg bg-primary-strong px-3 text-[12px] font-semibold text-primary-fg hover:bg-primary">{t("add")}</button>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            {tasks.length === 0 ? <p className="rounded-card border border-dashed border-line px-3 py-6 text-center text-[12px] text-subtle">{t("emptyTasks")}</p> : null}
            {tasks.map((tk) => (
              <div key={tk.id} className="flex items-start gap-2 rounded-card border border-line bg-card p-3">
                <button onClick={() => void completeTask(tk.id)} title={t("complete")} className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line text-subtle hover:border-success hover:bg-success/10 hover:text-success"><Check size={12} /></button>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium text-ink">{tk.title}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={["rounded-full px-1.5 py-0.5 text-[10px] font-medium", PRIO_TONE[tk.priority]].join(" ")}>{t(`priorities.${tk.priority}`)}</span>
                    {tk.dueDate ? <span className="inline-flex items-center gap-1 text-[11px] text-subtle"><CalendarClock size={11} /> {new Date(tk.dueDate).toLocaleDateString("en-GB")}</span> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {detailId ? <DealDetail dealId={detailId} catalog={catalog} staff={staff} onClose={() => setDetailId(null)} onChanged={() => void load()} /> : null}
    </div>
  );
}

interface DealDetailData { id: string; title: string; stage: string; status: string; value: string | null; productLineCode: string | null; estimatedPremium: string | null; exclusivity: string | null; source: string | null; producerName: string | null; currentInsurer: string | null; lossRatio: string | null; preferredInsurers: string[]; expectedCloseDate: string | null; notes: string | null; requestId: string | null; clientId: string | null; clientName: string | null; assigneeId: string | null; assigneeName: string | null; activities: Array<{ id: string; type: string; body: string; createdAt: string }> }

function DealDetail({ dealId, catalog, staff, onClose, onChanged }: { dealId: string; catalog: CatalogClass[]; staff: Staff[]; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("crm");
  const [d, setD] = useState<DealDetailData | null>(null);
  const [edit, setEdit] = useState<Partial<DealDetailData> & { preferredStr?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  const load = useCallback(() => { void api<DealDetailData>(`/crm/deals/${dealId}`).then(setD).catch(() => undefined); }, [dealId]);
  useEffect(() => { load(); }, [load]);

  const fmt = (n: string | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
  const lineName = (code: string | null) => catalog.flatMap((c) => c.lines).find((l) => l.code === code)?.name ?? code ?? "—";
  const field = "h-9 w-full rounded-lg border border-line bg-card px-2 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";

  async function save() {
    if (!edit) return;
    setBusy(true); setErr("");
    try {
      const body: Record<string, unknown> = {
        productLineCode: edit.productLineCode || undefined, value: edit.value ? Number(edit.value) : undefined,
        estimatedPremium: edit.estimatedPremium ? Number(edit.estimatedPremium) : undefined, exclusivity: edit.exclusivity || undefined,
        source: edit.source || undefined, producerName: edit.producerName || undefined, currentInsurer: edit.currentInsurer || undefined,
        lossRatio: edit.lossRatio ? Number(edit.lossRatio) : undefined, expectedCloseDate: edit.expectedCloseDate || undefined,
        assigneeId: edit.assigneeId || undefined, notes: edit.notes || undefined,
        preferredInsurers: edit.preferredStr ? edit.preferredStr.split(",").map((x) => x.trim()).filter(Boolean) : undefined,
      };
      await api(`/crm/deals/${dealId}`, { method: "PATCH", body: JSON.stringify(body) });
      setEdit(null); load(); onChanged();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); } finally { setBusy(false); }
  }

  async function convert() {
    setBusy(true); setErr("");
    try {
      const r = await api<{ request: { sequenceNo: string } }>(`/crm/deals/${dealId}/convert`, { method: "POST" });
      setDone(t("convertDone", { seq: r.request.sequenceNo })); load(); onChanged();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); } finally { setBusy(false); }
  }

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-0"><dt className="shrink-0 text-[12px] text-subtle">{label}</dt><dd className="text-end text-[12.5px] text-ink">{children}</dd></div>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        {!d ? <p className="py-8 text-center text-subtle">…</p> : (
          <>
            <div className="mb-1 flex items-start justify-between gap-2">
              <div><h2 className="text-[16px] font-bold text-ink">{d.title}</h2><p className="text-[12px] text-subtle">{d.clientName ?? "—"} · {t(`stages.${d.stage}`)}</p></div>
              <button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button>
            </div>
            {done ? <p className="mb-3 rounded-lg bg-success-soft px-3 py-2 text-[12px] font-medium text-success">{done}</p> : null}
            {err ? <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-[12px] font-medium text-danger">{err}</p> : null}

            <div className="mb-4 flex flex-wrap gap-2">
              {d.requestId ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-success-soft px-3 py-1.5 text-[12px] font-semibold text-success"><ArrowRightLeft size={14} /> {t("converted")}</span>
              ) : (
                <button onClick={convert} disabled={busy || !d.clientId || !d.productLineCode} title={!d.clientId || !d.productLineCode ? t("convertHint") : ""} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3 py-1.5 text-[12px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-50"><ArrowRightLeft size={14} /> {t("convert")}</button>
              )}
              {!edit ? <button onClick={() => setEdit({ ...d, preferredStr: (d.preferredInsurers ?? []).join(", "), expectedCloseDate: d.expectedCloseDate ? d.expectedCloseDate.slice(0, 10) : "" })} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2">{t("edit")}</button> : null}
            </div>
            {!d.requestId ? <p className="-mt-2 mb-4 text-[11px] text-subtle">{t("convertHint")}</p> : null}

            {edit ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("product")}</span>
                  <select value={edit.productLineCode ?? ""} onChange={(e) => setEdit({ ...edit, productLineCode: e.target.value })} className={field}><option value="">{t("optionalProduct")}</option>{catalog.map((cls) => <optgroup key={cls.code} label={cls.name}>{cls.lines.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</optgroup>)}</select></label>
                <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("lead.estimatedPremium")}</span><input type="number" value={edit.estimatedPremium ?? ""} onChange={(e) => setEdit({ ...edit, estimatedPremium: e.target.value })} className={`${field} tnum`} /></label>
                <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("lead.exclusivity")}</span><select value={edit.exclusivity ?? ""} onChange={(e) => setEdit({ ...edit, exclusivity: e.target.value })} className={field}><option value="">—</option><option value="exclusive">{t("lead.exclusive")}</option><option value="non_exclusive">{t("lead.non_exclusive")}</option></select></label>
                <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("lead.source")}</span><select value={edit.source ?? ""} onChange={(e) => setEdit({ ...edit, source: e.target.value })} className={field}><option value="">—</option><option value="direct">{t("lead.direct")}</option><option value="producer">{t("lead.producerSrc")}</option></select></label>
                {edit.source === "producer" ? <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("lead.producer")}</span><input value={edit.producerName ?? ""} onChange={(e) => setEdit({ ...edit, producerName: e.target.value })} className={field} /></label> : null}
                <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("lead.currentInsurer")}</span><input value={edit.currentInsurer ?? ""} onChange={(e) => setEdit({ ...edit, currentInsurer: e.target.value })} className={field} /></label>
                <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("lead.lossRatio")}</span><input type="number" value={edit.lossRatio ?? ""} onChange={(e) => setEdit({ ...edit, lossRatio: e.target.value })} className={`${field} tnum`} /></label>
                <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("lead.expectedClose")}</span><input type="date" value={edit.expectedCloseDate ?? ""} onChange={(e) => setEdit({ ...edit, expectedCloseDate: e.target.value })} className={field} /></label>
                <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("assignee")}</span><select value={edit.assigneeId ?? ""} onChange={(e) => setEdit({ ...edit, assigneeId: e.target.value })} className={field}><option value="">{t("unassigned")}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</select></label>
                <label className="block sm:col-span-2"><span className="mb-1 block text-[11px] text-muted">{t("lead.preferredInsurers")}</span><input value={edit.preferredStr ?? ""} onChange={(e) => setEdit({ ...edit, preferredStr: e.target.value })} className={field} /></label>
                <label className="block sm:col-span-2"><span className="mb-1 block text-[11px] text-muted">{t("lead.notes")}</span><textarea value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} className="h-16 w-full rounded-lg border border-line bg-card px-2 py-1.5 text-[12.5px]" /></label>
                <div className="flex justify-end gap-2 sm:col-span-2"><button onClick={() => setEdit(null)} className="h-9 rounded-lg border border-line px-3 text-[12px] text-muted hover:bg-surface-2">{t("cancel")}</button><button onClick={save} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><Check size={14} /> {t("save")}</button></div>
              </div>
            ) : (
              <dl className="rounded-card border border-line bg-surface-2/30 px-3">
                <Row label={t("product")}>{lineName(d.productLineCode)}</Row>
                <Row label={t("lead.estimatedPremium")}><span className="tnum">{fmt(d.estimatedPremium)}</span></Row>
                <Row label={t("value")}><span className="tnum">{fmt(d.value)}</span></Row>
                <Row label={t("lead.exclusivity")}>{d.exclusivity ? t(`lead.${d.exclusivity}`) : "—"}</Row>
                <Row label={t("lead.source")}>{d.source === "producer" ? `${t("lead.producerSrc")}${d.producerName ? ` · ${d.producerName}` : ""}` : d.source === "direct" ? t("lead.direct") : "—"}</Row>
                <Row label={t("lead.currentInsurer")}>{d.currentInsurer ?? "—"}</Row>
                <Row label={t("lead.lossRatio")}>{d.lossRatio ? `${Number(d.lossRatio)}%` : "—"}</Row>
                <Row label={t("lead.preferredInsurers")}>{d.preferredInsurers?.length ? d.preferredInsurers.join("، ") : "—"}</Row>
                <Row label={t("lead.expectedClose")}>{d.expectedCloseDate ? new Date(d.expectedCloseDate).toLocaleDateString("en-GB") : "—"}</Row>
                <Row label={t("assignee")}>{d.assigneeName ?? "—"}</Row>
                {d.notes ? <Row label={t("lead.notes")}>{d.notes}</Row> : null}
              </dl>
            )}

            {d.activities?.length ? (
              <div className="mt-4"><p className="mb-1.5 text-[12px] font-semibold text-subtle">{t("activityLog")}</p>
                <ol className="space-y-1.5">{d.activities.map((a) => <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2/40 px-3 py-1.5"><span className="text-[12px] text-ink">{a.body}</span><span className="shrink-0 text-[10.5px] text-subtle tnum">{new Date(a.createdAt).toLocaleDateString("en-GB")}</span></li>)}</ol>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
