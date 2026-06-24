"use client";

import { useEffect, useState } from "react";
import { Users, Wallet2, Clock, TrendingDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Row { id: string; insurerName: string | null; clientName: string | null; productLine: string | null; rate: string | null; amount: string | null; receivedAmount: string | null; status: string | null }
interface Data { summary: { total: number; received: number; accrued: number; variance: number; receivedPct: number }; rows: Row[] }

const STATUS_TONE: Record<string, BadgeTone> = { received: "success", variance: "danger", accrued: "warning" };
const STATUS_KEY: Record<string, string> = { received: "commissions.status.received", variance: "commissions.status.variance", accrued: "commissions.status.accrued" };

export default function CommissionsPage() {
  const t = useTranslations();
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { void api<Data>("/reports/commissions").then(setD).catch(() => undefined); }, []);

  const fmt = (n: string | number | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
  const variance = (r: Row) => (r.receivedAmount == null ? "—" : fmt(Number(r.amount ?? 0) - Number(r.receivedAmount)));
  const s = d?.summary;

  return (
    <div>
      <PageHeader title={t("commissions.title")} subtitle={t("commissions.subtitle")} />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="primary" icon={<Wallet2 size={18} />} title={t("commissions.kpi.total")} value={<span className="tnum">{s ? fmt(s.total) : "…"}</span>} />
        <StatCard tone="success" icon={<Wallet2 size={18} />} title={t("commissions.kpi.received")} value={<span className="tnum">{s ? fmt(s.received) : "…"}</span>} sub={s ? `${s.receivedPct}% ${t("commissions.kpi.receivedSub")}` : ""} />
        <StatCard tone="warning" icon={<Clock size={18} />} title={t("commissions.kpi.pending")} value={<span className="tnum">{s ? fmt(s.accrued) : "…"}</span>} />
        <StatCard tone="danger" icon={<TrendingDown size={18} />} title={t("commissions.kpi.variance")} value={<span className="tnum">{s ? fmt(s.variance) : "…"}</span>} sub={t("commissions.kpi.varianceSub")} />
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
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
            {d?.rows.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-surface-2/60">
                <td className="px-5 py-3 text-[13px] font-medium text-ink">{r.clientName ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-muted">{r.insurerName ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-muted tnum">{r.rate ? `${Number(r.rate)}%` : "—"}</td>
                <td className="px-5 py-3 text-[13px] font-medium text-ink tnum">{fmt(r.amount)}</td>
                <td className="px-5 py-3 text-[13px] text-subtle tnum">{fmt(r.receivedAmount)}</td>
                <td className={`px-5 py-3 text-[13px] tnum ${r.status === "variance" ? "font-medium text-danger" : "text-subtle"}`}>{variance(r)}</td>
                <td className="px-5 py-3">{r.status ? <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{t(STATUS_KEY[r.status] ?? "commissions.status.accrued")}</Badge> : null}</td>
              </tr>
            ))}
            {d && d.rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-10 text-center text-[13px] text-subtle">{t("portal.empty")}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
