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
  user: { id: string; fullName: string; email: string; status: string; mfaEnabled: boolean; createdAt: string; role: { name: string } | null; department: { name: string } | null };
  activity: Array<{ action: string; entity: string; entityId: string | null; meta: unknown; createdAt: string }>;
  stats: { totalActions: number; policiesCreated: number; approvals: number };
  policies: Array<{ id: string; sequenceNo: string | null; insurerName: string | null; totalPremium: string | null; status: string; endDate: string | null }>;
  deals: Array<{ id: string; title: string; stage: string; value: string | null; clientName: string | null }>;
  tasks: Array<{ id: string; title: string; priority: string; dueDate: string | null }>;
}

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
            {d.policies.map((p) => <tr key={p.id} className="border-b border-line last:border-0"><td className="px-3 py-2.5"><Badge tone={p.status === "ISSUED" ? "success" : "warning"}>{p.status}</Badge></td><td className="px-3 py-2.5 text-[12.5px] text-ink">{p.insurerName ?? "—"}</td><td className="px-3 py-2.5 text-[12.5px] tnum">{fmt(p.totalPremium)}</td><td className="px-3 py-2.5 text-[12px] text-muted">{p.sequenceNo}</td></tr>)}
          </tbody></table></div>
        ) : <p className="rounded-card border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-subtle">{t("noPolicies")}</p>) : null}

        {tab === "deals" ? (d.deals.length ? (
          <div className="space-y-2">{d.deals.map((dl) => (
            <div key={dl.id} className="flex items-center justify-between rounded-card border border-line bg-card p-3">
              <div><div className="text-[12.5px] font-semibold text-ink">{dl.title}</div>{dl.clientName ? <div className="text-[11.5px] text-subtle">{dl.clientName}</div> : null}</div>
              <div className="flex items-center gap-2">{dl.value ? <span className="text-[12px] font-bold text-primary tnum">{fmt(dl.value)}</span> : null}<Badge tone="info">{dl.stage}</Badge></div>
            </div>
          ))}</div>
        ) : <p className="rounded-card border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-subtle">{t("noDeals")}</p>) : null}

        {tab === "tasks" ? (d.tasks.length ? (
          <div className="space-y-2">{d.tasks.map((tk) => (
            <div key={tk.id} className="flex items-center justify-between rounded-card border border-line bg-card p-3">
              <span className="text-[12.5px] text-ink">{tk.title}</span>
              <div className="flex items-center gap-2"><Badge tone={tk.priority === "high" ? "danger" : "neutral"}>{tk.priority}</Badge>{tk.dueDate ? <span className="text-[11px] text-subtle">{d2(tk.dueDate)}</span> : null}</div>
            </div>
          ))}</div>
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
