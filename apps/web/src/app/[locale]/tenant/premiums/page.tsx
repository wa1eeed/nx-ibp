"use client";

import { useEffect, useMemo, useState } from "react";
import { Coins, Users, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";

interface ByClient { clientId: string; clientName: string; total: number; count: number }
interface Note { id: string; sequenceNo: string | null; clientName: string; total: number; createdAt: string }
interface Data { outstanding: number; byClient: ByClient[]; notes: Note[] }

const DAY = 86_400_000;

export default function PremiumsPage() {
  const t = useTranslations();
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { void api<Data>("/finance/receivables").then(setD).catch(() => undefined); }, []);

  const fmt = (n: number) => n.toLocaleString("en-US");
  const date = (s: string) => new Date(s).toLocaleDateString("en-GB");

  // تقرير أعمار الذمم: كل إشعار مدين يُوزَّع على شريحة عمرية حسب تاريخه، مجمّعًا حسب العميل.
  const aging = useMemo(() => {
    const now = Date.now();
    const m = new Map<string, { name: string; b: [number, number, number, number]; total: number; count: number }>();
    for (const n of d?.notes ?? []) {
      const days = (now - new Date(n.createdAt).getTime()) / DAY;
      const i = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
      const g = m.get(n.clientName) ?? { name: n.clientName, b: [0, 0, 0, 0], total: 0, count: 0 };
      g.b[i] += n.total; g.total += n.total; g.count += 1;
      m.set(n.clientName, g);
    }
    const rows = [...m.values()].sort((a, b) => b.b[3] - a.b[3] || b.total - a.total);
    const totals = rows.reduce((acc, r) => { r.b.forEach((v, i) => (acc.b[i] += v)); acc.total += r.total; return acc; }, { b: [0, 0, 0, 0] as number[], total: 0 });
    return { rows, totals };
  }, [d]);

  const overdue = aging.totals.b[2] + aging.totals.b[3]; // > 60 يوماً

  return (
    <div className="space-y-6">
      <PageHeader title={t("premiums.title")} subtitle={t("premiums.subtitle")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard tone="danger" icon={<Coins size={18} />} title={t("premiums.outstanding")} value={<span className="tnum">{d ? fmt(d.outstanding) : "…"}</span>} sub={t("common.sar")} />
        <StatCard tone="warning" icon={<AlertTriangle size={18} />} title={t("premiums.overdue")} value={<span className="tnum">{d ? fmt(overdue) : "…"}</span>} sub={t("premiums.over60")} />
        <StatCard tone="info" icon={<Users size={18} />} title={t("premiums.clients")} value={aging.rows.length || "…"} />
      </div>

      {/* تقرير أعمار الذمم المدينة */}
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">{t("premiums.aging")}</h2>
          <p className="text-[12px] text-subtle">{t("premiums.agingSub")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("premiums.col.client")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("premiums.bucket.current")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("premiums.bucket.d60")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("premiums.bucket.d90")}</th>
              <th className="px-5 py-3 text-end font-semibold text-danger">{t("premiums.bucket.over")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("premiums.col.total")}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {aging.rows.map((r) => (
                <tr key={r.name} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[13px] font-medium text-ink">{r.name} <span className="text-[11px] text-subtle">({r.count})</span></td>
                  <td className="px-5 py-3 text-end text-[13px] text-muted tnum">{r.b[0] ? fmt(r.b[0]) : "—"}</td>
                  <td className="px-5 py-3 text-end text-[13px] text-muted tnum">{r.b[1] ? fmt(r.b[1]) : "—"}</td>
                  <td className="px-5 py-3 text-end text-[13px] text-warning tnum">{r.b[2] ? fmt(r.b[2]) : "—"}</td>
                  <td className={`px-5 py-3 text-end text-[13px] tnum ${r.b[3] ? "font-semibold text-danger" : "text-subtle"}`}>{r.b[3] ? fmt(r.b[3]) : "—"}</td>
                  <td className="px-5 py-3 text-end text-[13px] font-semibold text-ink tnum">{fmt(r.total)}</td>
                </tr>
              ))}
              {d && aging.rows.length === 0 ? <tr><td colSpan={6} className="px-5 py-8 text-center text-[13px] text-subtle">{t("portal.empty")}</td></tr> : null}
            </tbody>
            {aging.rows.length ? (
              <tfoot><tr className="border-t-2 border-line bg-surface-2/40 text-[13px] font-bold text-ink">
                <td className="px-5 py-3">{t("premiums.totalRow")}</td>
                <td className="px-5 py-3 text-end tnum">{fmt(aging.totals.b[0])}</td>
                <td className="px-5 py-3 text-end tnum">{fmt(aging.totals.b[1])}</td>
                <td className="px-5 py-3 text-end tnum text-warning">{fmt(aging.totals.b[2])}</td>
                <td className="px-5 py-3 text-end tnum text-danger">{fmt(aging.totals.b[3])}</td>
                <td className="px-5 py-3 text-end tnum">{fmt(aging.totals.total)}</td>
              </tr></tfoot>
            ) : null}
          </table>
        </div>
      </section>

      {/* إشعارات المدين (التفصيل) */}
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="border-b border-line px-5 py-3.5"><h2 className="text-[15px] font-semibold text-ink">{t("premiums.debitNotes")}</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("premiums.col.no")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("premiums.col.client")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("premiums.col.date")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("premiums.col.total")}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {d?.notes.map((n) => (
                <tr key={n.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{n.sequenceNo ?? "—"}</td>
                  <td className="px-5 py-3 text-[13px] text-ink">{n.clientName}</td>
                  <td className="px-5 py-3 text-[12px] text-subtle tnum">{date(n.createdAt)}</td>
                  <td className="px-5 py-3 text-end text-[13px] font-medium text-ink tnum">{fmt(n.total)} <span className="text-[11px] text-subtle">{t("common.sar")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
