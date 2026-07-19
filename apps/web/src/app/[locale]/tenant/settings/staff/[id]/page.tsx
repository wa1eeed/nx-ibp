"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Activity, FileCheck2, CheckCircle2, Clock, ShieldCheck, ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api, getToken } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/ConfirmProvider";

interface Detail {
  user: { id: string; fullName: string; email: string; status: string; mfaEnabled: boolean; createdAt: string; allowedProductLines: string[]; commissionRate: number | null; role: { name: string } | null; department: { name: string } | null };
  activity: Array<{ action: string; entity: string; entityId: string | null; meta: unknown; createdAt: string }>;
  stats: { totalActions: number; policiesCreated: number; approvals: number };
  policies: Array<{ id: string; sequenceNo: string | null; insurerName: string | null; totalPremium: string | null; status: string; endDate: string | null }>;
  deals: Array<{ id: string; title: string; stage: string; status: string; value: string | null; productLineCode: string | null; clientName: string | null; createdAt: string }>;
  tasks: Array<{ id: string; title: string; priority: string; status: string; entityType: string | null; entityId: string | null; dueDate: string | null; createdAt: string }>;
}

const STAGE_TONE: Record<string, "info" | "warning" | "neutral" | "success"> = { new: "neutral", contacted: "info", quoting: "warning", proposal: "info", negotiation: "success" };
const STAGES = ["new", "contacted", "quoting", "proposal", "negotiation"];
const PRIOS = ["low", "normal", "high"];
const ENTITIES = ["client", "policy", "request", "claim", "service_request", "deal"];
const TABS = ["policies", "deals", "tasks", "activity"] as const;
const dt = (s: string) => new Date(s).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
const d2 = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB") : "—");
const fmt = (n: string | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const ACTION_AR: Record<string, string> = { create: "إنشاء", update: "تحديث", approve: "اعتماد", verify: "تحقّق", revert: "تراجع", login: "دخول", delete: "حذف", file_url: "فتح مستند", seed: "بذر" };

export default function StaffDetailPage() {
  const t = useTranslations("staffDetail");
  const params = useParams();
  const confirm = useConfirm();
  const id = String(params.id);
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("policies");

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
          <Badge tone={u.status === "ACTIVE" ? "success" : "neutral"}>{u.status}</Badge>
        </div>
      </header>

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

        {tab === "activity" ? (d.activity.length === 0 ? <p className="rounded-card border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-subtle">{t("empty")}</p> : (
          <ol className="relative space-y-3 border-s-2 border-line ps-4">
            {d.activity.map((a, i) => (
              <li key={i} className="relative">
                <span className="absolute -start-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card" />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] text-ink"><span className="font-semibold">{ACTION_AR[a.action] ?? a.action}</span> · {a.entity}{a.entityId ? ` (${a.entityId.slice(0, 8)})` : ""}</span>
                  <span className="shrink-0 text-[11px] text-subtle"><Clock size={10} className="inline" /> {dt(a.createdAt)}</span>
                </div>
              </li>
            ))}
          </ol>
        )) : null}
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
