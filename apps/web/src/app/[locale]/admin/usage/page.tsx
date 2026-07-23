"use client";

import { useEffect, useState } from "react";
import { Building2, Users, FileText, FileCheck2, ClipboardList, BadgeCheck, CircleDollarSign, Clock, UserPlus, Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import { papi } from "@/lib/api";
import { Link } from "@/i18n/routing";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Usage { tenants: number; users: number; clients: number; policies: number; requests: number; claims: number; verificationChecks: number }
interface Expiring { id: string; name: string; kind: "trial" | "subscription"; endsAt: string; daysLeft: number }
interface RecentSignup { id: string; name: string; status: string; createdAt: string; ownerEmail: string | null }
interface Overview { byStatus: Record<string, number>; mrr: number; expiring: Expiring[]; recentSignups: RecentSignup[]; newLeads: number }

const STATUS_TONE: Record<string, BadgeTone> = { ACTIVE: "success", TRIAL: "warning", SUSPENDED: "danger", CANCELLED: "neutral" };

export default function AdminUsagePage() {
  const t = useTranslations();
  const [u, setU] = useState<Usage | null>(null);
  const [o, setO] = useState<Overview | null>(null);
  useEffect(() => {
    void papi<Usage>("/platform/usage").then(setU).catch(() => undefined);
    void papi<Overview>("/platform/overview").then(setO).catch(() => undefined);
  }, []);

  const date = (s: string) => new Date(s).toLocaleDateString();
  const dayTone = (d: number): BadgeTone => (d < 0 ? "danger" : d <= 7 ? "warning" : "neutral");

  return (
    <AdminShell>
      <PageHeader title={t("admin.usage.title")} subtitle={t("admin.usage.subtitle")} />

      {/* صحّة الأعمال — الإيراد المتكرّر + توزيع الحالات + الطلبات الجديدة */}
      {o ? (
        <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard tone="success" icon={<CircleDollarSign size={18} />} title={t("admin.overview.mrr")} value={`${o.mrr.toLocaleString()} ${t("common.sar")}`} />
          <StatCard tone="primary" icon={<Building2 size={18} />} title={t("admin.overview.active")} value={o.byStatus.ACTIVE ?? 0} />
          <StatCard tone="warning" icon={<Clock size={18} />} title={t("admin.overview.trial")} value={o.byStatus.TRIAL ?? 0} />
          <StatCard tone="danger" icon={<Building2 size={18} />} title={t("admin.overview.suspended")} value={o.byStatus.SUSPENDED ?? 0} />
          <StatCard tone="info" icon={<Building2 size={18} />} title={t("admin.overview.cancelled")} value={o.byStatus.CANCELLED ?? 0} />
          <StatCard tone="info" icon={<Inbox size={18} />} title={t("admin.overview.newLeads")} value={o.newLeads} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* الاشتراكات الوشيكة على الانتهاء (≤30 يومًا) — تحتاج متابعة */}
        <section className="rounded-card border border-line bg-card shadow-card">
          <div className="flex items-center gap-2 px-5 py-3 text-[13px] font-bold text-ink"><Clock size={15} /> {t("admin.overview.expiringTitle")}</div>
          {o && o.expiring.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px]">
                <tbody className="divide-y divide-line">
                  {o.expiring.map((e) => (
                    <tr key={e.id} className="hover:bg-surface-2/60">
                      <td className="px-5 py-2.5 text-[13px] font-medium">
                        <Link href={`/admin/tenants/${e.id}`} className="text-ink hover:text-primary hover:underline">{e.name}</Link>
                      </td>
                      <td className="px-5 py-2.5 text-[12px] text-subtle">{t(`admin.overview.kind.${e.kind}`)}</td>
                      <td className="px-5 py-2.5 text-[12px] text-muted tnum">{date(e.endsAt)}</td>
                      <td className="px-5 py-2.5"><Badge tone={dayTone(e.daysLeft)}>{e.daysLeft} {t("admin.tenants.days")}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="px-5 pb-4 text-[12.5px] text-subtle">{t("admin.overview.expiringEmpty")}</p>}
        </section>

        {/* أحدث التسجيلات */}
        <section className="rounded-card border border-line bg-card shadow-card">
          <div className="flex items-center gap-2 px-5 py-3 text-[13px] font-bold text-ink"><UserPlus size={15} /> {t("admin.overview.recentTitle")}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px]">
              <tbody className="divide-y divide-line">
                {o?.recentSignups.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/60">
                    <td className="px-5 py-2.5 text-[13px] font-medium">
                      <Link href={`/admin/tenants/${r.id}`} className="text-ink hover:text-primary hover:underline">{r.name}</Link>
                    </td>
                    <td className="px-5 py-2.5 text-[12px] text-muted" dir="ltr">{r.ownerEmail ?? "—"}</td>
                    <td className="px-5 py-2.5 text-[12px] text-subtle tnum">{date(r.createdAt)}</td>
                    <td className="px-5 py-2.5"><Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* عدّادات الاستخدام عبر المنصّة */}
      {u ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard tone="info" icon={<Users size={18} />} title={t("admin.usage.users")} value={u.users} />
          <StatCard tone="success" icon={<Users size={18} />} title={t("admin.usage.clients")} value={u.clients} />
          <StatCard tone="primary" icon={<FileCheck2 size={18} />} title={t("admin.usage.policies")} value={u.policies} />
          <StatCard tone="warning" icon={<FileText size={18} />} title={t("admin.usage.requests")} value={u.requests} />
          <StatCard tone="danger" icon={<ClipboardList size={18} />} title={t("admin.usage.claims")} value={u.claims} />
          <StatCard tone="info" icon={<BadgeCheck size={18} />} title={t("admin.usage.checks")} value={u.verificationChecks} />
        </div>
      ) : null}
    </AdminShell>
  );
}
