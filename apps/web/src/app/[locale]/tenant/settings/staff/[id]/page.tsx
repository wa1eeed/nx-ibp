"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Activity, FileCheck2, CheckCircle2, Clock, ShieldCheck, ShieldOff, KeyRound, Check, Minus, Pencil, UserMinus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { RBAC_MODULES, type RbacModule } from "@ibp/shared";
import { Link } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { LifecycleTimeline } from "@/components/LifecycleTimeline";
import { Badge } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/ConfirmProvider";

interface Detail {
  user: { id: string; fullName: string; email: string; status: string; mfaEnabled: boolean; createdAt: string; allowedProductLines: string[]; commissionRate: number | null; role: { id: string; name: string; isPreset: boolean; permissions: Array<{ module: string; canAccess: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; canRevert: boolean }> } | null; department: { name: string } | null };
  activity: Array<{ action: string; entity: string; entityId: string | null; meta: unknown; createdAt: string; phase: string; label: string }>;
  stats: { totalActions: number; policiesCreated: number; approvals: number };
  policies: Array<{ id: string; sequenceNo: string | null; insurerName: string | null; totalPremium: string | null; status: string; endDate: string | null }>;
  deals: Array<{ id: string; title: string; stage: string; status: string; value: string | null; productLineCode: string | null; clientName: string | null; createdAt: string }>;
  tasks: Array<{ id: string; title: string; priority: string; status: string; entityType: string | null; entityId: string | null; dueDate: string | null; createdAt: string }>;
}

const STAGE_TONE: Record<string, "info" | "warning" | "neutral" | "success"> = { new: "neutral", contacted: "info", quoting: "warning", proposal: "info", negotiation: "success" };
const STAGES = ["new", "contacted", "quoting", "proposal", "negotiation"];
const PRIOS = ["low", "normal", "high"];
const ENTITIES = ["client", "policy", "request", "claim", "service_request", "deal"];
const TABS = ["hr", "permissions", "policies", "deals", "tasks", "activity"] as const;
const PERM_COLS: Array<{ key: "canAccess" | "canCreate" | "canEdit" | "canDelete" | "canRevert"; labelKey: string }> = [
  { key: "canAccess", labelKey: "staff.colAccess" },
  { key: "canCreate", labelKey: "staff.colCreate" },
  { key: "canEdit", labelKey: "staff.colEdit" },
  { key: "canDelete", labelKey: "staff.colDelete" },
  { key: "canRevert", labelKey: "roles.colRevert" },
];
const dt = (s: string) => new Date(s).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
const d2 = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB") : "—");
const fmt = (n: string | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

export default function StaffDetailPage() {
  const t = useTranslations("staffDetail");
  const tg = useTranslations();
  const params = useParams();
  const confirm = useConfirm();
  const id = String(params.id);
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("hr");
  const [offboarding, setOffboarding] = useState(false);

  const load = useCallback(async () => {
    try { setD(await api<Detail>(`/staff/${id}`)); } catch { /* تجاهل */ }
  }, [id]);
  useEffect(() => { if (getToken()) void load(); }, [load]);

  async function resetMfa() {
    const ok = await confirm({ title: t("mfa.resetTitle"), description: t("mfa.resetDesc"), tone: "danger", confirmLabel: t("mfa.reset") });
    if (!ok) return;
    await api(`/staff/${id}/mfa/reset`, { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
    await load();
  }

  if (!d) return <div className="grid min-h-[40vh] place-items-center text-subtle">…</div>;
  const u = d.user;

  const kpi = (label: string, value: number, Icon: typeof Activity) => (
    <div className="rounded-card border border-line bg-card p-3">
      <div className="flex items-center justify-between"><span className="text-[11.5px] text-subtle">{label}</span><Icon size={15} className="text-subtle" /></div>
      <div className="mt-1 text-[19px] font-bold text-ink tnum">{value}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Link href="/tenant/settings/staff" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink"><ArrowRight size={14} className="rtl:rotate-180" /> {t("back")}</Link>

      <header className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-[18px] font-bold text-primary-strong">{u.fullName.trim().charAt(0)}</div>
        <div>
          <h1 className="text-[20px] font-bold text-ink">{u.fullName}</h1>
          <p className="text-[12.5px] text-subtle">{u.email}</p>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${u.mfaEnabled ? "bg-success-soft text-success" : "bg-surface-2 text-subtle"}`}>
            {u.mfaEnabled ? <ShieldCheck size={12} /> : <ShieldOff size={12} />} {t("mfa.label")}: {u.mfaEnabled ? t("mfa.on") : t("mfa.off")}
          </span>
          {u.mfaEnabled ? (
            <button onClick={resetMfa} className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/5 px-3 py-1.5 text-[12px] font-semibold text-danger hover:bg-danger/10">
              <ShieldOff size={14} /> {t("mfa.reset")}
            </button>
          ) : null}
          {u.status === "ACTIVE" ? (
            <button onClick={() => setOffboarding(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/5 px-3 py-1.5 text-[12px] font-semibold text-danger hover:bg-danger/10">
              <UserMinus size={14} /> {t("offboard.button")}
            </button>
          ) : null}
          <Badge tone={u.status === "ACTIVE" ? "success" : "neutral"}>{u.status}</Badge>
        </div>
      </header>

      {offboarding ? <OffboardDialog userId={id} userName={u.fullName} onClose={() => setOffboarding(false)} onDone={() => { setOffboarding(false); void load(); }} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr]">
        <div className="rounded-card border border-line bg-card p-4">
          <dl className="space-y-1.5 text-[12.5px]">
            <div className="flex justify-between"><dt className="text-subtle">{t("role")}</dt><dd className="font-medium text-ink">{u.role?.name ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-subtle">{t("department")}</dt><dd className="font-medium text-ink">{u.department?.name ?? t("noDept")}</dd></div>
            <div className="flex justify-between"><dt className="text-subtle">{t("joined")}</dt><dd className="font-medium text-ink">{new Date(u.createdAt).toLocaleDateString("en-GB")}</dd></div>
          </dl>
        </div>
        {kpi(t("stats.total"), d.stats.totalActions, Activity)}
        <div className="grid grid-cols-2 gap-3">
          {kpi(t("stats.issued"), d.stats.policiesCreated, FileCheck2)}
          {kpi(t("stats.approvals"), d.stats.approvals, CheckCircle2)}
        </div>
      </div>

      <ProductScope userId={id} current={u.allowedProductLines} onSaved={() => void load()} />

      <CommissionRate userId={id} current={u.commissionRate} onSaved={() => void load()} />

      <div className="flex flex-wrap gap-1.5 border-b border-line">
        {TABS.map((x) => (
          <button key={x} onClick={() => setTab(x)} className={["rounded-t-lg px-3 py-2 text-[12.5px] font-medium transition-colors", tab === x ? "border-b-2 border-primary text-primary" : "text-muted hover:text-ink"].join(" ")}>
            {t(`tabs.${x}`)}{x === "policies" && d.policies.length ? ` (${d.policies.length})` : x === "deals" && d.deals.length ? ` (${d.deals.length})` : x === "tasks" && d.tasks.length ? ` (${d.tasks.length})` : ""}
          </button>
        ))}
      </div>

      <div>
        {tab === "hr" ? <HrTab userId={id} /> : null}
        {tab === "permissions" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-card p-3.5 shadow-card">
              <div className="flex items-center gap-2 text-[13px]">
                <KeyRound size={16} className="text-primary" />
                <span className="font-semibold text-ink">{t("roleLabel")}: {d.user.role?.name ?? "—"}</span>
                {d.user.role ? (d.user.role.isPreset ? <Badge tone="info">{tg("roles.preset")}</Badge> : <Badge tone="neutral">{tg("roles.custom")}</Badge>) : null}
              </div>
              {d.user.role ? <Link href="/tenant/settings/roles" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3 py-1.5 text-[12px] font-semibold text-primary-fg hover:bg-primary"><Pencil size={13} /> {t("editRolePerms")}</Link> : null}
            </div>
            <p className="text-[11.5px] leading-relaxed text-subtle">{t("permsNote")}</p>
            <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
              <table className="w-full text-[12.5px]">
                <thead><tr className="border-b border-line bg-surface-2 text-subtle">
                  <th className="px-3 py-2 text-start font-semibold">{t("moduleCol")}</th>
                  {PERM_COLS.map((c) => <th key={c.key} className="px-2 py-2 text-center font-semibold">{tg(c.labelKey)}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {RBAC_MODULES.map((m: RbacModule) => {
                    const p = d.user.role?.permissions?.find((x) => x.module === m);
                    return (
                      <tr key={m} className={`hover:bg-surface-2/40 ${p?.canAccess ? "" : "opacity-45"}`}>
                        <td className="px-3 py-1.5 font-medium text-ink">{tg(`modules.${m}`)}</td>
                        {PERM_COLS.map((c) => (
                          <td key={c.key} className="px-2 py-1.5 text-center">
                            {p?.[c.key] ? <Check size={15} className="mx-auto text-success" /> : <Minus size={14} className="mx-auto text-subtle/40" />}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "policies" ? (d.policies.length ? (
          <div className="overflow-hidden rounded-card border border-line bg-card"><table className="w-full"><thead><tr className="border-b border-line text-[11px] uppercase text-subtle"><th className="px-3 py-2 text-start font-semibold">{t("statusCol")}</th><th className="px-3 py-2 text-start font-semibold">{t("insurer")}</th><th className="px-3 py-2 text-start font-semibold">{t("premium")}</th><th className="px-3 py-2 text-start font-semibold">#</th></tr></thead><tbody>
            {d.policies.map((p) => <tr key={p.id} className="border-b border-line last:border-0 hover:bg-surface-2/60"><td className="px-3 py-2.5"><Badge tone={p.status === "ISSUED" ? "success" : "warning"}>{p.status}</Badge></td><td className="px-3 py-2.5 text-[12.5px] text-ink">{p.insurerName ?? "—"}</td><td className="px-3 py-2.5 text-[12.5px] tnum">{fmt(p.totalPremium)}</td><td className="px-3 py-2.5 text-[12px]"><Link href={`/tenant/policies/${p.id}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">{p.sequenceNo ?? "—"} <ArrowRight size={12} className="rtl:rotate-180" /></Link></td></tr>)}
          </tbody></table></div>
        ) : <p className="rounded-card border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-subtle">{t("noPolicies")}</p>) : null}

        {tab === "deals" ? (d.deals.length ? (
          <div className="space-y-2">{d.deals.map((dl) => (
            <div key={dl.id} className="rounded-card border border-line bg-card p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink">{dl.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-subtle">
                    <span>{t("client")}: <span className="text-muted">{dl.clientName ?? "—"}</span></span>
                    {dl.productLineCode ? <span>{t("product")}: <span className="text-muted">{dl.productLineCode}</span></span> : null}
                    <span>{t("created")}: <span className="text-muted tnum">{d2(dl.createdAt)}</span></span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {dl.value ? <span className="text-[13px] font-bold text-primary tnum">{fmt(dl.value)} <span className="text-[10px] font-normal text-subtle">{t("value")}</span></span> : null}
                  <Badge tone={STAGE_TONE[dl.stage] ?? "neutral"}>{STAGES.includes(dl.stage) ? t(`stages.${dl.stage}`) : dl.stage}</Badge>
                </div>
              </div>
            </div>
          ))}</div>
        ) : <p className="rounded-card border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-subtle">{t("noDeals")}</p>) : null}

        {tab === "tasks" ? (d.tasks.length ? (
          <div className="space-y-2">{d.tasks.map((tk) => {
            const overdue = tk.dueDate && new Date(tk.dueDate).getTime() < Date.now();
            return (
              <div key={tk.id} className="rounded-card border border-line bg-card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink">{tk.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-subtle">
                      {tk.entityType ? <span>{t("related")}: <span className="text-muted">{ENTITIES.includes(tk.entityType) ? t(`entities.${tk.entityType}`) : tk.entityType}{tk.entityId ? ` (${tk.entityId.slice(0, 8)})` : ""}</span></span> : null}
                      <span>{t("created")}: <span className="text-muted tnum">{d2(tk.createdAt)}</span></span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={tk.priority === "high" ? "danger" : "neutral"}>{PRIOS.includes(tk.priority) ? t(`priorities.${tk.priority}`) : tk.priority}</Badge>
                    {tk.dueDate ? <span className={`inline-flex items-center gap-1 text-[11px] tnum ${overdue ? "font-semibold text-danger" : "text-subtle"}`}><Clock size={10} /> {d2(tk.dueDate)}{overdue ? ` · ${t("overdue")}` : ""}</span> : null}
                  </div>
                </div>
              </div>
            );
          })}</div>
        ) : <p className="rounded-card border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-subtle">{t("noTasks")}</p>) : null}

        {tab === "activity" ? <LifecycleTimeline events={d.activity.map((a) => ({ at: a.createdAt, phase: a.phase, label: a.label }))} descending /> : null}
      </div>
    </div>
  );
}

interface CatalogClass { code: string; name: string; lines: Array<{ code: string; name: string }> }

/** محرِّر نطاق المنتجات لموظف: بلا تحديد = كل الفروع؛ أو حصر بفروع مختارة. */
function CommissionRate({ userId, current, onSaved }: { userId: string; current: number | null; onSaved: () => void }) {
  const t = useTranslations("staffDetail");
  const [val, setVal] = useState(current != null ? String(current) : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { setVal(current != null ? String(current) : ""); }, [current]);
  async function save() {
    setBusy(true); setMsg("");
    try {
      const rate = val.trim() === "" ? null : Number(val);
      await api(`/staff/${userId}/commission-rate`, { method: "POST", body: JSON.stringify({ rate }) });
      setMsg(t("commission.saved")); onSaved();
    } catch { setMsg(t("commission.error")); } finally { setBusy(false); }
  }
  const dirty = (val.trim() === "" ? null : Number(val)) !== current;
  return (
    <section className="rounded-card border border-line bg-card p-4 shadow-card">
      <div className="mb-2"><h2 className="text-[13.5px] font-bold text-ink">{t("commission.title")}</h2><p className="text-[11.5px] text-subtle">{t("commission.hint")}</p></div>
      <div className="flex items-end gap-2">
        <label className="block flex-1 max-w-[180px]"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("commission.rate")}</span>
          <div className="relative">
            <input type="number" min="0" max="100" step="0.5" value={val} onChange={(e) => setVal(e.target.value)} placeholder="0" className="h-9 w-full rounded-lg border border-line bg-card px-3 pe-7 text-[13px] tnum text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <span className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center text-[12px] text-subtle">%</span>
          </div>
        </label>
        <button onClick={save} disabled={busy || !dirty} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-50">{busy ? "…" : t("commission.save")}</button>
        {msg ? <span className="text-[11.5px] font-medium text-success">{msg}</span> : null}
      </div>
    </section>
  );
}

function ProductScope({ userId, current, onSaved }: { userId: string; current: string[]; onSaved: () => void }) {
  const t = useTranslations("staffDetail");
  const [catalog, setCatalog] = useState<CatalogClass[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set(current));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { void api<CatalogClass[]>("/catalog").then(setCatalog).catch(() => undefined); }, []);
  useEffect(() => { setSel(new Set(current)); }, [current]);

  const nameOf = (code: string) => catalog.flatMap((c) => c.lines).find((l) => l.code === code)?.name ?? code;
  const toggle = (code: string) => setSel((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });

  async function save() {
    setBusy(true); setMsg("");
    try {
      await api(`/staff/${userId}/product-scope`, { method: "POST", body: JSON.stringify({ lines: [...sel] }) });
      setMsg(t("scope.saved")); setEditing(false); onSaved();
    } catch { setMsg(t("scope.error")); } finally { setBusy(false); }
  }

  return (
    <section className="rounded-card border border-line bg-card p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-[13.5px] font-bold text-ink">{t("scope.title")}</h2>
          <p className="text-[11.5px] text-subtle">{t("scope.hint")}</p>
        </div>
        {!editing ? <button onClick={() => setEditing(true)} className="h-8 rounded-lg border border-line px-3 text-[12px] font-medium text-muted hover:bg-surface-2">{t("scope.edit")}</button> : null}
      </div>

      {!editing ? (
        current.length === 0
          ? <span className="inline-flex items-center gap-1.5 rounded-lg bg-success-soft px-2.5 py-1 text-[12px] font-medium text-success">{t("scope.all")}</span>
          : <div className="flex flex-wrap gap-1.5">{current.map((c) => <span key={c} className="rounded-lg bg-primary/10 px-2.5 py-1 text-[12px] font-medium text-primary">{nameOf(c)}</span>)}</div>
      ) : (
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11.5px] text-subtle">
            <button onClick={() => setSel(new Set())} className="rounded border border-line px-2 py-0.5 hover:bg-surface-2">{t("scope.clear")} ({t("scope.all")})</button>
            <span className="tnum">{sel.size ? t("scope.selected", { n: sel.size }) : t("scope.all")}</span>
          </div>
          <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-line bg-surface-2/30 p-3">
            {catalog.map((cls) => (
              <div key={cls.code}>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-subtle">{cls.name}</div>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {cls.lines.map((l) => (
                    <label key={l.code} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12.5px] text-ink hover:bg-card">
                      <input type="checkbox" checked={sel.has(l.code)} onChange={() => toggle(l.code)} className="accent-primary" />
                      {l.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => { setSel(new Set(current)); setEditing(false); }} className="h-8 rounded-lg border border-line px-3 text-[12px] text-muted hover:bg-surface-2">{t("scope.cancel")}</button>
            <button onClick={save} disabled={busy} className="h-8 rounded-lg bg-primary-strong px-4 text-[12px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">{busy ? "…" : t("scope.save")}</button>
          </div>
        </div>
      )}
      {msg ? <p className="mt-2 text-[11.5px] font-medium text-success">{msg}</p> : null}
    </section>
  );
}

/** حوار إنهاء الخدمة (المغادرة/الاستقالة): نقل المهام المفتوحة + تعطيل الحساب + تحرير/إلغاء المقعد. */
function OffboardDialog({ userId, userName, onClose, onDone }: { userId: string; userName: string; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("staffDetail");
  const [peers, setPeers] = useState<Array<{ id: string; fullName: string; email: string; status: string }>>([]);
  const [reassignToId, setReassignToId] = useState("");
  const [cancelSeat, setCancelSeat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ reassigned: { deals: number; tasks: number; serviceRequests: number; complaints: number } } | null>(null);

  useEffect(() => {
    void api<Array<{ id: string; fullName: string; email: string; status: string }>>("/staff")
      .then((rows) => setPeers(rows.filter((r) => r.status === "ACTIVE" && r.id !== userId)))
      .catch(() => undefined);
  }, [userId]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api<{ reassigned: { deals: number; tasks: number; serviceRequests: number; complaints: number } }>(`/staff/${userId}/offboard`, {
        method: "POST", body: JSON.stringify({ reassignToId: reassignToId || undefined, cancelSeat }),
      });
      setResult(res);
      setTimeout(onDone, 1400);
    } catch { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-card border border-line bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink"><UserMinus size={17} className="text-danger" /> {t("offboard.title")}</h2>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-ink"><X size={16} /></button>
        </div>
        {result ? (
          <div className="rounded-lg bg-success-soft px-3 py-3 text-[12.5px] text-success">
            {t("offboard.done", { deals: result.reassigned.deals, tasks: result.reassigned.tasks, service: result.reassigned.serviceRequests, complaints: result.reassigned.complaints })}
          </div>
        ) : (
          <>
            <p className="mb-3 text-[12.5px] leading-relaxed text-muted">{t("offboard.desc", { name: userName })}</p>
            <label className="mb-3 block">
              <span className="mb-1 block text-[11.5px] font-medium text-muted">{t("offboard.reassign")}</span>
              <select value={reassignToId} onChange={(e) => setReassignToId(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-2.5 py-2 text-[13px] text-ink">
                <option value="">{t("offboard.noReassign")}</option>
                {peers.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </label>
            <label className="mb-4 flex items-start gap-2">
              <input type="checkbox" checked={cancelSeat} onChange={(e) => setCancelSeat(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-line" />
              <span className="text-[12.5px] text-ink">{t("offboard.cancelSeat")}<span className="mt-0.5 block text-[11px] text-subtle">{t("offboard.cancelSeatHint")}</span></span>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="h-9 rounded-lg border border-line px-4 text-[12.5px] text-muted hover:bg-surface-2">{t("offboard.cancel")}</button>
              <button onClick={submit} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-danger px-4 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
                <UserMinus size={14} /> {busy ? "…" : t("offboard.confirm")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface EmpProfile { id: string; fullName: string; email: string; jobTitle: string | null; hireDate: string | null; dateOfBirth: string | null; nationalId: string | null; nationalIdExpiry: string | null; nationality: string | null; phone: string | null; baseSalary: string | null; emergencyContact: string | null; addressLine: string | null; role: { name: string } | null; department: { name: string } | null }
interface EmpDoc { id: string; type: string; title: string; number: string | null; issueDate: string | null; expiryDate: string | null; fileUrl: string | null }
const DOC_TYPES = ["contract", "national_id", "iqama", "passport", "certificate", "other"] as const;
const PROFILE_FIELDS = [
  { key: "jobTitle", type: "text" }, { key: "hireDate", type: "date" }, { key: "dateOfBirth", type: "date" },
  { key: "nationality", type: "text" }, { key: "phone", type: "text" }, { key: "nationalId", type: "text" },
  { key: "nationalIdExpiry", type: "date" }, { key: "baseSalary", type: "number" }, { key: "emergencyContact", type: "text" },
  { key: "addressLine", type: "text" },
] as const;

/** تبويب الملف الوظيفي (HR): بيانات التوظيف + الوثائق بتنبيه الانتهاء. محكوم بصلاحية hr (403 ⇒ رسالة لطيفة). */
function HrTab({ userId }: { userId: string }) {
  const t = useTranslations("hr");
  const [p, setP] = useState<EmpProfile | null>(null);
  const [docs, setDocs] = useState<EmpDoc[]>([]);
  const [denied, setDenied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState<{ type: string; title: string; number: string; issueDate: string; expiryDate: string }>({ type: "contract", title: "", number: "", issueDate: "", expiryDate: "" });

  const load = useCallback(async () => {
    try {
      const prof = await api<EmpProfile>(`/hr/employees/${userId}/profile`);
      setP(prof);
      setForm(Object.fromEntries(PROFILE_FIELDS.map((f) => {
        const raw = (prof as unknown as Record<string, unknown>)[f.key];
        let v = raw == null ? "" : String(raw);
        if (f.type === "date" && v) v = v.slice(0, 10); // ISO ⇒ yyyy-mm-dd لمُدخل التاريخ
        return [f.key, v] as [string, string];
      })));
      setDocs(await api<EmpDoc[]>(`/hr/employees/${userId}/documents`));
    } catch (e) { if (e instanceof ApiError && e.status === 403) setDenied(true); }
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  if (denied) return <p className="rounded-card border border-line bg-card p-5 text-[12.5px] text-subtle">{t("denied")}</p>;
  if (!p) return <p className="text-[12.5px] text-subtle">…</p>;

  const save = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      for (const f of PROFILE_FIELDS) { const v = (form[f.key] ?? "").trim(); if (f.type === "number") body[f.key] = v ? Number(v) : undefined; else body[f.key] = v || ""; }
      await api(`/hr/employees/${userId}/profile`, { method: "PUT", body: JSON.stringify(body) });
      setEditing(false); await load();
    } finally { setBusy(false); }
  };
  const addDoc = async () => {
    if (!doc.title.trim()) return;
    setBusy(true);
    try {
      await api(`/hr/employees/${userId}/documents`, { method: "POST", body: JSON.stringify({ type: doc.type, title: doc.title.trim(), number: doc.number.trim() || undefined, issueDate: doc.issueDate || undefined, expiryDate: doc.expiryDate || undefined }) });
      setDoc({ type: "contract", title: "", number: "", issueDate: "", expiryDate: "" }); await load();
    } finally { setBusy(false); }
  };
  const delDoc = async (id: string) => { await api(`/hr/documents/${id}`, { method: "DELETE" }).catch(() => undefined); await load(); };

  const val = (k: string) => ((p as unknown as Record<string, unknown>)[k] as string | null) ?? null;
  const expTone = (s: string | null) => { if (!s) return "text-subtle"; const d = Math.ceil((new Date(s).getTime() - Date.now()) / 86400000); return d < 0 ? "text-danger font-semibold" : d <= 60 ? "text-warning font-semibold" : "text-muted"; };

  return (
    <div className="space-y-4">
      {/* بيانات التوظيف */}
      <section className="rounded-card border border-line bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13.5px] font-bold text-ink">{t("profileTitle")}</h3>
          {!editing ? <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2"><Pencil size={13} /> {t("edit")}</button> : null}
        </div>
        {!editing ? (
          <dl className="grid gap-x-6 gap-y-2.5 text-[12.5px] sm:grid-cols-2">
            {PROFILE_FIELDS.map((f) => (
              <div key={f.key} className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
                <dt className="text-subtle">{t(`field.${f.key}`)}</dt>
                <dd className={`text-end font-medium ${f.key === "nationalIdExpiry" ? expTone(val(f.key)) : "text-ink"}`}>
                  {f.type === "date" ? d2(val(f.key)) : f.key === "baseSalary" ? (val(f.key) ? `${Number(val(f.key)).toLocaleString()} ﷼` : "—") : (val(f.key) || "—")}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {PROFILE_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-[11.5px] font-medium text-muted">{t(`field.${f.key}`)}</span>
                <input type={f.type} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[13px] text-ink" />
              </label>
            ))}
            <div className="col-span-full mt-1 flex justify-end gap-2">
              <button onClick={() => { setEditing(false); void load(); }} className="h-9 rounded-lg border border-line px-4 text-[12.5px] text-muted hover:bg-surface-2">{t("cancel")}</button>
              <button onClick={save} disabled={busy} className="h-9 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">{busy ? "…" : t("save")}</button>
            </div>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-subtle">{t("encNote")}</p>
      </section>

      {/* الوثائق */}
      <section className="rounded-card border border-line bg-card p-4 shadow-card">
        <h3 className="mb-3 text-[13.5px] font-bold text-ink">{t("docsTitle")} ({docs.length})</h3>
        {docs.length ? (
          <div className="mb-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12.5px]">
              <thead><tr className="border-b border-line text-[11px] uppercase text-subtle">
                <th className="px-2 py-2 text-start font-semibold">{t("doc.type")}</th>
                <th className="px-2 py-2 text-start font-semibold">{t("doc.title")}</th>
                <th className="px-2 py-2 text-start font-semibold">{t("doc.number")}</th>
                <th className="px-2 py-2 text-start font-semibold">{t("doc.expiry")}</th>
                <th className="px-2 py-2"></th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {docs.map((dd) => (
                  <tr key={dd.id} className="hover:bg-surface-2/50">
                    <td className="px-2 py-2 text-muted">{t(`docType.${dd.type}`)}</td>
                    <td className="px-2 py-2 font-medium text-ink">{dd.title}</td>
                    <td className="px-2 py-2 text-muted tnum">{dd.number || "—"}</td>
                    <td className={`px-2 py-2 tnum ${expTone(dd.expiryDate)}`}>{d2(dd.expiryDate)}</td>
                    <td className="px-2 py-2 text-end"><button onClick={() => void delDoc(dd.id)} className="rounded p-1 text-subtle hover:bg-danger/10 hover:text-danger"><X size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mb-3 text-[12px] text-subtle">{t("docsEmpty")}</p>}
        {/* إضافة وثيقة */}
        <div className="grid gap-2 rounded-lg bg-surface-2/50 p-3 sm:grid-cols-[auto_1fr_auto_auto_auto]">
          <select value={doc.type} onChange={(e) => setDoc({ ...doc, type: e.target.value })} className="rounded-lg border border-line bg-bg px-2 py-1.5 text-[12.5px] text-ink">
            {DOC_TYPES.map((x) => <option key={x} value={x}>{t(`docType.${x}`)}</option>)}
          </select>
          <input value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} placeholder={t("doc.title")} className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[12.5px] text-ink" />
          <input value={doc.number} onChange={(e) => setDoc({ ...doc, number: e.target.value })} placeholder={t("doc.number")} className="w-28 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[12.5px] text-ink" />
          <input type="date" value={doc.expiryDate} onChange={(e) => setDoc({ ...doc, expiryDate: e.target.value })} title={t("doc.expiry")} className="rounded-lg border border-line bg-bg px-2 py-1.5 text-[12.5px] text-ink" />
          <button onClick={addDoc} disabled={busy || !doc.title.trim()} className="inline-flex items-center gap-1 rounded-lg bg-primary-strong px-3 py-1.5 text-[12px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-50">{t("doc.add")}</button>
        </div>
      </section>
    </div>
  );
}
