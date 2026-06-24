"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, BadgeCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Count { count: number }
interface Overview {
  clientsByStatus: ({ status: string } & Count)[];
  riskDistribution: ({ level: string } & Count)[];
  checksByType: ({ type: string } & Count)[];
  recentChecks: { id: string; checkType: string; status: string; riskLevel: string | null; clientName: string; createdAt: string }[];
  totalChecks: number;
}

const STATUS_TONE: Record<string, BadgeTone> = { APPROVED: "success", PENDING: "warning", REJECTED: "danger" };
const RISK_TONE: Record<string, BadgeTone> = { low: "success", medium: "warning", high: "danger" };

export default function CompliancePage() {
  const t = useTranslations();
  const [o, setO] = useState<Overview | null>(null);
  useEffect(() => { void api<Overview>("/compliance/overview").then(setO).catch(() => undefined); }, []);

  const date = (s: string) => new Date(s).toLocaleDateString("en-GB");
  const statusCount = (s: string) => o?.clientsByStatus.find((c) => c.status === s)?.count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t("compliance.title")} subtitle={t("compliance.subtitle")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="success" icon={<ShieldCheck size={18} />} title={t("compliance.approved")} value={statusCount("APPROVED")} />
        <StatCard tone="warning" icon={<ShieldAlert size={18} />} title={t("compliance.pending")} value={statusCount("PENDING")} />
        <StatCard tone="danger" icon={<ShieldAlert size={18} />} title={t("compliance.rejected")} value={statusCount("REJECTED")} />
        <StatCard tone="info" icon={<BadgeCheck size={18} />} title={t("compliance.checks")} value={o?.totalChecks ?? "…"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* توزيع المخاطر */}
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <h2 className="mb-4 text-[15px] font-semibold text-ink">{t("compliance.riskDist")}</h2>
          <div className="flex flex-wrap gap-2">
            {o?.riskDistribution.map((r) => (
              <div key={r.level} className="rounded-lg border border-line bg-surface-2/40 px-4 py-2.5 text-center">
                <div className="text-[20px] font-bold text-ink tnum">{r.count}</div>
                <Badge tone={RISK_TONE[r.level] ?? "neutral"}>{t(`compliance.risk.${r.level}`)}</Badge>
              </div>
            ))}
            {o && o.riskDistribution.length === 0 ? <p className="text-[13px] text-subtle">{t("portal.empty")}</p> : null}
          </div>
        </section>

        {/* أنواع عمليات التحقّق */}
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <h2 className="mb-4 text-[15px] font-semibold text-ink">{t("compliance.checksByType")}</h2>
          <table className="w-full">
            <tbody className="divide-y divide-line">
              {o?.checksByType.map((c) => (
                <tr key={c.type}>
                  <td className="py-2.5 text-[13px] text-ink">{c.type}</td>
                  <td className="py-2.5 text-end text-[13px] font-medium text-ink tnum">{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* عمليات التحقّق الأخيرة */}
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="border-b border-line px-5 py-3.5"><h2 className="text-[15px] font-semibold text-ink">{t("compliance.recent")}</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("compliance.col.client")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("compliance.col.type")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("compliance.col.risk")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("compliance.col.date")}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {o?.recentChecks.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[13px] font-medium text-ink">{c.clientName}</td>
                  <td className="px-5 py-3 text-[12.5px] text-muted">{c.checkType}</td>
                  <td className="px-5 py-3">{c.riskLevel ? <Badge tone={RISK_TONE[c.riskLevel] ?? "neutral"}>{t(`compliance.risk.${c.riskLevel}`)}</Badge> : <span className="text-[12px] text-subtle">—</span>}</td>
                  <td className="px-5 py-3 text-[12px] text-subtle tnum">{date(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
