import {
  CalendarX2,
  MailOpen,
  RefreshCw,
  HandCoins,
  ClipboardCheck,
  ShieldAlert,
  ArrowRight,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { StatCard } from "@/components/ui/StatCard";
import {
  dashboardKpis,
  urgentTasks,
  renewals,
  recentActivity,
  type TaskKind,
} from "@/lib/mock";

const TASK_ICON: Record<TaskKind, typeof RefreshCw> = {
  renewal: RefreshCw,
  approval: ClipboardCheck,
  kyc: ShieldAlert,
};
const TASK_TONE: Record<TaskKind, string> = {
  renewal: "bg-primary-soft text-primary",
  approval: "bg-warning-soft text-warning",
  kyc: "bg-danger-soft text-danger",
};

export default function DashboardPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const t = useTranslations();
  const maxBar = Math.max(...renewals.series);

  return (
    <div className="space-y-5">
      {/* بطاقات المؤشرات */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="danger" icon={<CalendarX2 size={18} />} title={t("dashboard.kpi.expiringTitle")} value={dashboardKpis.expiring} sub={t("dashboard.kpi.expiringSub")} />
        <StatCard tone="warning" icon={<MailOpen size={18} />} title={t("dashboard.kpi.pendingTitle")} value={dashboardKpis.pending} sub={t("dashboard.kpi.pendingSub")} />
        <StatCard tone="primary" icon={<RefreshCw size={18} />} title={t("dashboard.kpi.renewalsTitle")} value={dashboardKpis.renewalsCount} sub={<span className="tnum">{dashboardKpis.renewalsAmount}</span>} />
        <StatCard tone="success" icon={<HandCoins size={18} />} title={t("dashboard.kpi.commissionsTitle")} value={<span className="tnum">{dashboardKpis.commissions}</span>} sub={t("dashboard.kpi.commissionsSub")} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* المهام العاجلة */}
        <section className="rounded-card border border-line bg-card shadow-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">{t("dashboard.urgentTasks")}</h2>
              <p className="text-[12px] text-subtle">{t("dashboard.subtitle")}</p>
            </div>
            <button className="text-[12.5px] font-medium text-primary hover:underline">
              {t("common.viewAll")} ({urgentTasks.length})
            </button>
          </div>
          <ul className="divide-y divide-line">
            {urgentTasks.map((task) => {
              const Icon = TASK_ICON[task.kind];
              return (
                <li key={task.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${TASK_TONE[task.kind]}`}>
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-ink">{task.client}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-subtle">
                      <span className="tnum">{task.ref}</span>
                      <span>·</span>
                      <span className="tnum">{task.due}</span>
                      {task.amount ? (
                        <>
                          <span>·</span>
                          <span className="font-medium text-muted tnum">{task.amount}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink">
                    {t("dashboard.openTask")}
                    <ArrowRight size={14} className="rtl:rotate-180" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* التجديدات القادمة */}
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <h2 className="text-[15px] font-semibold text-ink">{t("dashboard.upcomingRenewals")}</h2>
          <p className="mt-0.5 text-[12px] text-subtle">{t("dashboard.renewalsDist")}</p>
          <div className="mt-3 flex items-end justify-between">
            <div className="text-3xl font-bold tracking-tight text-ink tnum">{renewals.count}</div>
            <div className="text-[12.5px] font-medium text-muted tnum">{renewals.amount}</div>
          </div>
          <div className="mt-4 flex h-24 items-end gap-1.5">
            {renewals.series.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/80"
                  style={{ height: `${Math.max(8, (v / maxBar) * 80)}px` }}
                  title={`${renewals.months[i]}: ${v}`}
                />
                <span className="text-[8.5px] text-subtle">{renewals.months[i]}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* النشاط الأخير */}
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <h2 className="text-[15px] font-semibold text-ink">{t("dashboard.recentActivity")}</h2>
        <ul className="mt-3 space-y-3">
          {recentActivity.map((a) => (
            <li key={a.id} className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <div className="flex-1">
                <p className="text-[13px] text-ink">{a.text}</p>
                <p className="text-[11px] text-subtle">{a.when}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
