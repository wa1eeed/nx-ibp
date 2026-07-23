"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { papi, ApiError } from "@/lib/api";
import { Link } from "@/i18n/routing";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/ConfirmProvider";

interface Tenant {
  id: string; name: string; status: string; billingModel: string;
  owner: { fullName: string; email: string } | null;
  subscription: { seatsUsed: number; plan: { code: string; name: string; seatLimit: number } } | null;
  access?: { state: string; endsAt: string | null; daysLeft: number | null };
  _count: { users: number; clients: number; policies: number };
}

const TONE: Record<string, BadgeTone> = { ACTIVE: "success", SUSPENDED: "danger", TRIAL: "warning", CANCELLED: "neutral" };
const ACCESS_TONE: Record<string, BadgeTone> = { active: "success", trial: "warning", trial_expired: "danger", subscription_expired: "danger", suspended: "danger", cancelled: "neutral" };

export default function AdminTenantsPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Tenant[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => setRows(await papi<Tenant[]>("/platform/tenants")), []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  async function toggle(id: string, current: string, name: string) {
    const status = current === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const k = status === "SUSPENDED" ? "tenantSuspend" : "tenantActivate";
    const ok = await confirm({
      title: t(`confirm.${k}.title`),
      description: t(`confirm.${k}.desc`, { name }),
      confirmLabel: t(`confirm.${k}.action`),
      tone: status === "SUSPENDED" ? "danger" : "primary",
    });
    if (!ok) return;
    setError("");
    try { await papi(`/platform/tenants/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "خطأ"); }
  }

  return (
    <AdminShell>
      <PageHeader title={t("admin.tenants.title")} subtitle={t("admin.tenants.subtitle")} />
      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[760px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
            <th className="px-5 py-3 text-start font-semibold">{t("admin.tenants.col.name")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("admin.tenants.col.owner")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("admin.tenants.col.plan")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("admin.tenants.col.seats")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("admin.tenants.col.usage")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("admin.tenants.col.billing")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("admin.tenants.col.expiry")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("admin.tenants.col.status")}</th>
            <th className="px-5 py-3"></th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2/60">
                <td className="px-5 py-3 text-[13.5px] font-medium">
                  <Link href={`/admin/tenants/${r.id}`} className="text-ink hover:text-primary hover:underline">{r.name}</Link>
                </td>
                <td className="px-5 py-3 text-[12.5px] text-muted">
                  {r.owner ? <span dir="ltr" className="block">{r.owner.email}</span> : "—"}
                </td>
                <td className="px-5 py-3 text-[13px] text-muted">{r.subscription?.plan.name ?? "—"}</td>
                <td className="px-5 py-3 text-[12.5px] tnum">{r.subscription ? r.subscription.seatsUsed : "—"}</td>
                <td className="px-5 py-3 text-[12px] text-subtle tnum">{r._count.clients} {t("admin.tenants.clients")} · {r._count.policies} {t("admin.tenants.policies")}</td>
                <td className="px-5 py-3 text-[12px] text-muted">{t(`admin.billingModel.${r.billingModel}`)}</td>
                <td className="px-5 py-3 text-[12px]">
                  {r.access?.endsAt ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-muted tnum">{new Date(r.access.endsAt).toLocaleDateString()}</span>
                      <Badge tone={ACCESS_TONE[r.access.state] ?? "neutral"}>{r.access.daysLeft ?? 0} {t("admin.tenants.days")}</Badge>
                    </span>
                  ) : <span className="text-subtle">—</span>}
                </td>
                <td className="px-5 py-3"><Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge></td>
                <td className="px-5 py-3 text-end">
                  <button onClick={() => toggle(r.id, r.status, r.name)} className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
                    {r.status === "ACTIVE" ? t("admin.tenants.suspend") : t("admin.tenants.activate")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
