"use client";

import { useEffect, useState } from "react";
import { CalendarX2, MailOpen, RefreshCw, HandCoins, ArrowRight, FileCheck2, ClipboardList } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { Link } from "@/i18n/routing";
import { StatCard } from "@/components/ui/StatCard";
import { AttendanceWidget } from "@/components/hr/AttendanceWidget";

interface Renewal { id: string; sequenceNo: string | null; insurerName: string | null; amount: number; endDate: string | null }
interface Activity { kind: string; ref: string | null; amount?: number; status?: string; at: string }
interface Dashboard {
  kpis: { expiring: number; pending: number; renewalsCount: number; renewalsAmount: number; commissions: number };
  renewals: Renewal[];
  recentActivity: Activity[];
}

export default function DashboardPage() {
  const t = useTranslations();
  const [d, setD] = useState<Dashboard | null>(null);
  useEffect(() => { void api<Dashboard>("/reports/dashboard").then(setD).catch(() => undefined); }, []);

  const fmt = (n: number) => n.toLocaleString("en-US");
  const date = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB") : "—");
  const k = d?.kpis;

  return (
    <div className="space-y-5">
      <AttendanceWidget />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="danger" icon={<CalendarX2 size={18} />} title={t("dashboard.kpi.expiringTitle")} value={k?.expiring ?? "…"} sub={t("dashboard.kpi.expiringSub")} />
        <StatCard tone="warning" icon={<MailOpen size={18} />} title={t("dashboard.kpi.pendingTitle")} value={k?.pending ?? "…"} sub={t("dashboard.kpi.pendingSub")} />
        <StatCard tone="primary" icon={<RefreshCw size={18} />} title={t("dashboard.kpi.renewalsTitle")} value={k?.renewalsCount ?? "…"} sub={<span className="tnum">{k ? `${fmt(k.renewalsAmount)} ${t("common.sar")}` : ""}</span>} />
        <StatCard tone="success" icon={<HandCoins size={18} />} title={t("dashboard.kpi.commissionsTitle")} value={<span className="tnum">{k ? fmt(k.commissions) : "…"}</span>} sub={t("dashboard.kpi.commissionsSub")} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* التجديدات القادمة */}
        <section className="rounded-card border border-line bg-card shadow-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">{t("dashboard.upcomingRenewals")}</h2>
              <p className="text-[12px] text-subtle">{t("dashboard.renewalsDist")}</p>
            </div>
            <Link href="/tenant/renewals" className="text-[12.5px] font-medium text-primary hover:underline">{t("common.viewAll")}</Link>
          </div>
          <ul className="divide-y divide-line">
            {d?.renewals.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><RefreshCw size={17} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-ink tnum">{r.sequenceNo}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-subtle">
                    <span>{r.insurerName ?? "—"}</span><span>·</span>
                    <span className="tnum">{date(r.endDate)}</span><span>·</span>
                    <span className="font-medium text-muted tnum">{fmt(r.amount)} {t("common.sar")}</span>
                  </div>
                </div>
                <Link href="/tenant/renewals" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-[12.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
                  {t("dashboard.openTask")}<ArrowRight size={14} className="rtl:rotate-180" />
                </Link>
              </li>
            ))}
            {d && d.renewals.length === 0 ? <li className="px-5 py-8 text-center text-[13px] text-subtle">{t("dashboard.noRenewals")}</li> : null}
          </ul>
        </section>

        {/* ملخّص سريع */}
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <h2 className="text-[15px] font-semibold text-ink">{t("dashboard.quickSummary")}</h2>
          <dl className="mt-4 space-y-3.5">
            <div className="flex items-center justify-between"><dt className="text-[13px] text-muted">{t("dashboard.kpi.expiringTitle")}</dt><dd className="text-[15px] font-bold text-ink tnum">{k?.expiring ?? "…"}</dd></div>
            <div className="flex items-center justify-between"><dt className="text-[13px] text-muted">{t("dashboard.kpi.pendingTitle")}</dt><dd className="text-[15px] font-bold text-ink tnum">{k?.pending ?? "…"}</dd></div>
            <div className="flex items-center justify-between"><dt className="text-[13px] text-muted">{t("dashboard.kpi.renewalsTitle")}</dt><dd className="text-[15px] font-bold text-ink tnum">{k?.renewalsCount ?? "…"}</dd></div>
            <div className="flex items-center justify-between border-t border-line pt-3"><dt className="text-[13px] text-muted">{t("dashboard.kpi.commissionsTitle")}</dt><dd className="text-[15px] font-bold text-success tnum">{k ? fmt(k.commissions) : "…"}</dd></div>
          </dl>
        </section>
      </div>

      {/* النشاط الأخير */}
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <h2 className="text-[15px] font-semibold text-ink">{t("dashboard.recentActivity")}</h2>
        <ul className="mt-3 space-y-3">
          {d?.recentActivity.map((a, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md ${a.kind === "policy" ? "bg-primary-soft text-primary" : "bg-warning-soft text-warning"}`}>
                {a.kind === "policy" ? <FileCheck2 size={14} /> : <ClipboardList size={14} />}
              </span>
              <div className="flex-1">
                <p className="text-[13px] text-ink">
                  {a.kind === "policy" ? t("dashboard.actPolicy", { ref: a.ref ?? "" }) : t("dashboard.actClaim", { ref: a.ref ?? "" })}
                  {a.amount ? <span className="text-muted tnum"> — {fmt(a.amount)} {t("common.sar")}</span> : null}
                  {a.status ? <span className="text-subtle"> — {a.status}</span> : null}
                </p>
                <p className="text-[11px] text-subtle tnum">{date(a.at)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
