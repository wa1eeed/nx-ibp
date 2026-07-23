"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Crown, Building2, UserCog, CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import { papi, setToken } from "@/lib/api";
import { Link } from "@/i18n/routing";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface UserRow { id: string; fullName: string; email: string; status: string; createdAt: string; role: { name: string } | null }
interface Access { state: string; endsAt: string | null; daysLeft: number | null }
interface TenantDetail {
  id: string; name: string; nameEn: string | null; status: string; billingModel: string; crNumber: string | null; createdAt: string;
  owner: { fullName: string; email: string } | null;
  subscription: { seatsUsed: number; seatsLicensed: number; cycle: string; startedAt: string | null; renewsAt: string | null; plan: { code: string; name: string; seatLimit: number; trialDays: number } } | null;
  users: UserRow[];
  access: Access;
  _count: { users: number; clients: number; policyRequests: number; policies: number; claims: number };
}
interface PlanRow { code: string; name: string }

const TONE: Record<string, BadgeTone> = { ACTIVE: "success", SUSPENDED: "danger", TRIAL: "warning", CANCELLED: "neutral" };
const ACCESS_TONE: Record<string, BadgeTone> = { active: "success", trial: "warning", trial_expired: "danger", subscription_expired: "danger", suspended: "danger", cancelled: "neutral" };
const STATUSES = ["ACTIVE", "TRIAL", "SUSPENDED", "CANCELLED"] as const;

export default function TenantDetailPage({ params }: { params: { id: string } }) {
  const t = useTranslations();
  const [d, setD] = useState<TenantDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [saving, setSaving] = useState("");
  const load = useCallback(async () => setD(await papi<TenantDetail>(`/platform/tenants/${params.id}`)), [params.id]);
  useEffect(() => { void load().catch(() => undefined); }, [load]);
  useEffect(() => { void papi<PlanRow[]>("/platform/plans").then(setPlans).catch(() => undefined); }, []);

  // الدخول كالحساب (انتحال): يُصدر توكن مستأجر موسوم، يُحفظ كتوكن الموظف (منفصل عن توكن المنصّة) ثم ينتقل للوحة المستأجر
  const enterAs = async () => {
    setBusy(true);
    try {
      const res = await papi<{ accessToken: string }>(`/platform/tenants/${params.id}/impersonate`, { method: "POST" });
      setToken(res.accessToken);
      window.location.href = "/ar/tenant/dashboard";
    } catch { setBusy(false); }
  };

  // إجراءات دورة حياة الاشتراك — تسري فورًا (إبطال كاش الوصول في الخلفية)
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setSaving(label);
    try { await fn(); await load(); } finally { setSaving(""); }
  };
  const changePlan = (planCode: string) => act("plan", () => papi(`/platform/tenants/${params.id}/plan`, { method: "PUT", body: JSON.stringify({ planCode }) }));
  const extend = (months: number) => act("extend", () => papi(`/platform/tenants/${params.id}/renewal`, { method: "POST", body: JSON.stringify({ months }) }));
  const setStatus = (status: string) => act("status", () => papi(`/platform/tenants/${params.id}/status`, { method: "POST", body: JSON.stringify({ status }) }));

  const date = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");
  const Cell = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div><div className="text-[11.5px] text-subtle">{label}</div><div className="mt-0.5 text-[13px] font-medium text-ink">{value}</div></div>
  );

  return (
    <AdminShell>
      <div className="mb-3">
        <Link href="/admin/tenants" className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
          <ArrowRight size={14} className="ltr:rotate-180" /> {t("admin.tenantDetail.back")}
        </Link>
      </div>
      <PageHeader title={d?.name ?? t("admin.tenantDetail.title")} subtitle={d?.nameEn ?? ""} />
      {!d ? <p className="text-[13px] text-subtle">…</p> : (
        <div className="space-y-5">
          {/* مالك الحساب — سوبر أدمن الشركة */}
          <section className="rounded-card border border-primary/30 bg-primary/5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[12px] font-semibold text-primary"><Crown size={15} /> {t("admin.tenantDetail.owner")}</div>
                {d.owner ? (
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="text-[15px] font-bold text-ink">{d.owner.fullName}</span>
                    <span dir="ltr" className="text-[13px] text-muted">{d.owner.email}</span>
                  </div>
                ) : <p className="mt-2 text-[13px] text-subtle">{t("admin.tenantDetail.noOwner")}</p>}
              </div>
              {/* الدخول كالحساب (انتحال) — يفتح لوحة المستأجر بصلاحية المالك مع بانر عودة */}
              <button onClick={enterAs} disabled={busy || !d.owner}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#6d28d9] px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-[#5b21b6] disabled:opacity-50">
                <UserCog size={15} /> {busy ? t("common.loading") : t("admin.tenantDetail.impersonate")}
              </button>
            </div>
          </section>

          {/* بيانات الحساب + الاشتراك */}
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-card border border-line bg-card p-5">
              <h3 className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-ink"><Building2 size={15} /> {t("admin.tenantDetail.account")}</h3>
              <div className="grid grid-cols-2 gap-3">
                <Cell label={t("admin.tenantDetail.billing")} value={t(`admin.billingModel.${d.billingModel}`)} />
                <Cell label={t("admin.tenantDetail.cr")} value={d.crNumber ?? "—"} />
                <Cell label={t("admin.tenantDetail.joined")} value={date(d.createdAt)} />
                <Cell label={t("admin.tenantDetail.seats")} value={d.subscription ? `${d.subscription.seatsUsed} / ${d.subscription.seatsLicensed}` : "—"} />
              </div>
              {/* التحكّم في الحالة — تعليق/تفعيل/إلغاء يسري فورًا */}
              <div className="mt-4 border-t border-line pt-3">
                <div className="mb-1.5 text-[11.5px] text-subtle">{t("admin.tenantDetail.statusControl")}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={d.status} onChange={(e) => void setStatus(e.target.value)} disabled={saving === "status"}
                    className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[12.5px] font-medium text-ink">
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <Badge tone={TONE[d.status] ?? "neutral"}>{d.status}</Badge>
                </div>
              </div>
            </section>
            <section className="rounded-card border border-line bg-card p-5">
              <h3 className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-ink"><CreditCard size={15} /> {t("admin.tenantDetail.subscription")}</h3>
              {/* الباقة — قابلة للتغيير من السوبر أدمن (يسري فورًا على الميزات) */}
              <div className="mb-3">
                <div className="mb-1.5 text-[11.5px] text-subtle">{t("admin.tenantDetail.plan")}</div>
                <select value={d.subscription?.plan.code ?? ""} onChange={(e) => void changePlan(e.target.value)} disabled={saving === "plan" || !d.subscription}
                  className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[13px] font-medium text-ink">
                  {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                </select>
              </div>
              {/* حالة الاشتراك + تاريخ الانتهاء + تمديد يدوي */}
              <div className="rounded-lg bg-surface-2/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] text-subtle">{t(`admin.tenantDetail.accessState.${d.access.state}`)}</span>
                  <Badge tone={ACCESS_TONE[d.access.state] ?? "neutral"}>
                    {d.access.endsAt ? `${d.access.daysLeft ?? 0} ${t("admin.tenantDetail.daysLeft")}` : "—"}
                  </Badge>
                </div>
                <div className="mt-1 text-[13px] font-semibold text-ink">{d.access.endsAt ? date(d.access.endsAt) : t("admin.tenantDetail.noExpiry")}</div>
                <div className="mt-2.5 flex items-center gap-2">
                  <span className="text-[11.5px] text-subtle">{t("admin.tenantDetail.extend")}</span>
                  <button onClick={() => void extend(1)} disabled={saving === "extend"} className="rounded-md bg-primary/10 px-2 py-1 text-[12px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-50">+{t("admin.tenantDetail.month")}</button>
                  <button onClick={() => void extend(12)} disabled={saving === "extend"} className="rounded-md bg-primary/10 px-2 py-1 text-[12px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-50">+{t("admin.tenantDetail.year")}</button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 border-t border-line pt-3 text-center">
                <Cell label={t("admin.tenantDetail.clients")} value={d._count.clients} />
                <Cell label={t("admin.tenantDetail.policies")} value={d._count.policies} />
                <Cell label={t("admin.tenantDetail.requests")} value={d._count.policyRequests} />
                <Cell label={t("admin.tenantDetail.claims")} value={d._count.claims} />
              </div>
            </section>
          </div>

          {/* حسابات الموظفين */}
          <section className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
            <div className="px-5 py-3 text-[13px] font-bold text-ink">{t("admin.tenantDetail.users")} ({d._count.users})</div>
            <table className="w-full min-w-[640px]">
              <thead><tr className="border-y border-line text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-5 py-2.5 text-start font-semibold">{t("admin.tenantDetail.owner").split(" ")[0]}</th>
                <th className="px-5 py-2.5 text-start font-semibold">{t("admin.tenantDetail.email")}</th>
                <th className="px-5 py-2.5 text-start font-semibold">{t("admin.tenantDetail.role")}</th>
                <th className="px-5 py-2.5 text-start font-semibold">{t("admin.tenantDetail.status")}</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {d.users.map((u, i) => (
                  <tr key={u.id} className="hover:bg-surface-2/60">
                    <td className="px-5 py-2.5 text-[13px] font-medium text-ink">
                      {u.fullName}{i === 0 ? <Crown size={12} className="ms-1 inline text-primary" /> : null}
                    </td>
                    <td className="px-5 py-2.5 text-[12.5px] text-muted" dir="ltr">{u.email}</td>
                    <td className="px-5 py-2.5 text-[12.5px] text-muted">{u.role?.name ?? "—"}</td>
                    <td className="px-5 py-2.5"><Badge tone={TONE[u.status] ?? "neutral"}>{u.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </AdminShell>
  );
}
