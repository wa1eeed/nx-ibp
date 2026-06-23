import { FileDown, Users, Wallet2, Clock, TrendingDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { commissionRows, commissionSummary, type CommissionStatus } from "@/lib/mock";

const STATUS_TONE: Record<CommissionStatus, BadgeTone> = {
  received: "success",
  variance: "danger",
  accrued: "warning",
};
const STATUS_KEY: Record<CommissionStatus, string> = {
  received: "status.received",
  variance: "status.variance",
  accrued: "status.accrued",
};

export default function CommissionsPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const t = useTranslations();

  return (
    <div>
      <PageHeader
        title={t("commissions.title")}
        subtitle={t("commissions.subtitle")}
        actions={
          <>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink">
              <FileDown size={15} />
              {t("commissions.exportByInsurer")}
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink">
              <Users size={15} />
              {t("commissions.exportByClient")}
            </button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="primary" icon={<Wallet2 size={18} />} title={t("commissions.kpi.total")} value={<span className="tnum">{commissionSummary.total}</span>} />
        <StatCard tone="success" icon={<Wallet2 size={18} />} title={t("commissions.kpi.received")} value={<span className="tnum">{commissionSummary.received}</span>} sub={`${commissionSummary.receivedPct} ${t("commissions.kpi.receivedSub")}`} />
        <StatCard tone="warning" icon={<Clock size={18} />} title={t("commissions.kpi.pending")} value={<span className="tnum">{commissionSummary.pending}</span>} />
        <StatCard tone="danger" icon={<TrendingDown size={18} />} title={t("commissions.kpi.variance")} value={<span className="tnum">{commissionSummary.variance}</span>} sub={t("commissions.kpi.varianceSub")} />
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.policyNo")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.client")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.insurer")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.rate")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.amount")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.received")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.variance")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {commissionRows.map((r) => (
                <tr key={r.policyNo} className="transition-colors hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{r.policyNo}</td>
                  <td className="px-5 py-3 text-[13px] text-ink">{r.client}</td>
                  <td className="px-5 py-3 text-[13px] text-muted">{r.insurer}</td>
                  <td className="px-5 py-3 text-[13px] text-muted tnum">{r.rate}</td>
                  <td className="px-5 py-3 text-[13px] font-medium text-ink tnum">{r.amount}</td>
                  <td className="px-5 py-3 text-[13px] text-subtle tnum">{r.received}</td>
                  <td className={`px-5 py-3 text-[13px] tnum ${r.variance.startsWith("-") ? "font-medium text-danger" : "text-subtle"}`}>{r.variance}</td>
                  <td className="px-5 py-3">
                    <Badge tone={STATUS_TONE[r.status]}>{t(STATUS_KEY[r.status])}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
