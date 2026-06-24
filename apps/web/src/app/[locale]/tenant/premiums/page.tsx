"use client";

import { useEffect, useState } from "react";
import { Coins, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";

interface ByClient { clientId: string; clientName: string; total: number; count: number }
interface Note { id: string; sequenceNo: string | null; clientName: string; total: number; createdAt: string }
interface Data { outstanding: number; byClient: ByClient[]; notes: Note[] }

export default function PremiumsPage() {
  const t = useTranslations();
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { void api<Data>("/finance/receivables").then(setD).catch(() => undefined); }, []);

  const fmt = (n: number) => n.toLocaleString("en-US");
  const date = (s: string) => new Date(s).toLocaleDateString("en-GB");
  const maxClient = Math.max(1, ...(d?.byClient.map((c) => c.total) ?? [1]));

  return (
    <div className="space-y-6">
      <PageHeader title={t("premiums.title")} subtitle={t("premiums.subtitle")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard tone="danger" icon={<Coins size={18} />} title={t("premiums.outstanding")} value={<span className="tnum">{d ? fmt(d.outstanding) : "…"}</span>} sub={t("common.sar")} />
        <StatCard tone="info" icon={<Users size={18} />} title={t("premiums.clients")} value={d?.byClient.length ?? "…"} />
        <StatCard tone="warning" icon={<Coins size={18} />} title={t("premiums.notes")} value={d?.notes.length ?? "…"} />
      </div>

      {/* المستحقّ حسب العميل */}
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <h2 className="mb-4 text-[15px] font-semibold text-ink">{t("premiums.byClient")}</h2>
        <ul className="space-y-3">
          {d?.byClient.map((c) => (
            <li key={c.clientId}>
              <div className="mb-1 flex items-center justify-between text-[12.5px]">
                <span className="font-medium text-ink">{c.clientName} <span className="text-subtle">({c.count})</span></span>
                <span className="tnum text-muted">{fmt(c.total)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-danger" style={{ width: `${(c.total / maxClient) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      </section>

      {/* إشعارات المدين */}
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="border-b border-line px-5 py-3.5"><h2 className="text-[15px] font-semibold text-ink">{t("premiums.debitNotes")}</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("premiums.col.no")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("premiums.col.client")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("premiums.col.date")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("premiums.col.total")}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {d?.notes.map((n) => (
                <tr key={n.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{n.sequenceNo ?? "—"}</td>
                  <td className="px-5 py-3 text-[13px] text-ink">{n.clientName}</td>
                  <td className="px-5 py-3 text-[12px] text-subtle tnum">{date(n.createdAt)}</td>
                  <td className="px-5 py-3 text-[13px] font-medium text-ink tnum">{fmt(n.total)} <span className="text-[11px] text-subtle">{t("common.sar")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
