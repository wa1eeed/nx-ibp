"use client";

import { useCallback, useEffect, useState } from "react";
import { KanbanSquare, Plus, Check, Trophy, X, CalendarClock, RefreshCw, FileText, ClipboardList, Percent, AlarmClock } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, getToken } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Deal { id: string; title: string; stage: string; status: string; value: string | null; clientId: string | null; clientName: string | null; assigneeId: string | null; assigneeName: string | null }
interface Task { id: string; title: string; dueDate: string | null; priority: string; assigneeId: string | null }
interface Client { id: string; name: string }
interface Staff { id: string; fullName: string }
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
  const [dealForm, setDealForm] = useState<{ title: string; clientId: string; value: string; assigneeId: string } | null>(null);
  const [taskForm, setTaskForm] = useState<{ title: string; assigneeId: string; dueDate: string; priority: string } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [d, tk, c, s] = await Promise.all([
        api<Deal[]>("/crm/deals"),
        api<Task[]>(`/crm/tasks${mineOnly ? "?mine=1" : ""}`),
        api<Client[]>("/clients").catch(() => [] as Client[]),
        api<Staff[]>("/staff").catch(() => [] as Staff[]),
      ]);
      setDeals(d); setTasks(tk); setClients(c); setStaff(s);
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
    await run(api("/crm/deals", { method: "POST", body: JSON.stringify({ title: dealForm.title.trim(), clientId: dealForm.clientId || undefined, value: dealForm.value ? Number(dealForm.value) : undefined, assigneeId: dealForm.assigneeId || undefined }) }));
    setDealForm(null);
  }
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
            <button onClick={() => setDealForm({ title: "", clientId: "", value: "", assigneeId: "" })} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-semibold text-white hover:opacity-90">
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
                        <div className="text-[13px] font-semibold text-ink">{d.title}</div>
                        {d.clientName ? <div className="mt-0.5 text-[11.5px] text-subtle">{d.clientName}</div> : null}
                        <div className="mt-1.5 flex items-center justify-between">
                          {d.value ? <span className="text-[12px] font-bold text-primary tnum">{fmt(d.value)}</span> : <span />}
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
    </div>
  );
}
