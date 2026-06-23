"use client";

import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { useTranslations } from "next-intl";
import { cpapi } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";

interface DebitNote { id: string; sequenceNo: string | null; policyId: string | null; netAmount: string | null; vatAmount: string | null; createdAt: string }
interface Invoice { id: string; sequenceNo: string | null; insurerName: string | null; netAmount: string | null; vatAmount: string | null; totalAmount: string | null; status: string | null; createdAt: string }
interface Statement { debitNotes: DebitNote[]; invoices: Invoice[]; outstanding: number }

export default function PortalStatement() {
  const t = useTranslations();
  const [s, setS] = useState<Statement | null>(null);
  useEffect(() => { void cpapi<Statement>("/portal/statement").then(setS).catch(() => undefined); }, []);

  const fmt = (n: string | number | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
  const date = (d: string) => new Date(d).toLocaleDateString("en-GB");
  const total = (net: string | null, vat: string | null) => Number(net ?? 0) + Number(vat ?? 0);

  return (
    <PortalShell>
      <PageHeader title={t("portal.statement.title")} subtitle={t("portal.statement.subtitle")} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard tone="danger" icon={<Receipt size={18} />} title={t("portal.statement.outstanding")}
          value={s ? `${s.outstanding.toLocaleString()} ${t("common.sar")}` : "…"} />
        <StatCard tone="info" icon={<Receipt size={18} />} title={t("portal.statement.debitNotes")} value={s?.debitNotes.length ?? 0} />
        <StatCard tone="primary" icon={<Receipt size={18} />} title={t("portal.statement.invoices")} value={s?.invoices.length ?? 0} />
      </div>

      <h2 className="mb-2 text-[14px] font-bold text-ink">{t("portal.statement.debitNotes")}</h2>
      <div className="mb-6 overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[640px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
            <th className="px-5 py-3 text-start font-semibold">{t("portal.statement.col.no")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.statement.col.date")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.statement.col.net")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.statement.col.vat")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.statement.col.total")}</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {s?.debitNotes.map((d) => (
              <tr key={d.id} className="hover:bg-surface-2/60">
                <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{d.sequenceNo ?? "—"}</td>
                <td className="px-5 py-3 text-[12px] text-subtle tnum">{date(d.createdAt)}</td>
                <td className="px-5 py-3 text-[13px] tnum text-muted">{fmt(d.netAmount)}</td>
                <td className="px-5 py-3 text-[13px] tnum text-muted">{fmt(d.vatAmount)}</td>
                <td className="px-5 py-3 text-[13px] tnum font-semibold text-ink">{fmt(total(d.netAmount, d.vatAmount))}</td>
              </tr>
            ))}
            {s && s.debitNotes.length === 0 ? <tr><td colSpan={5} className="px-5 py-8 text-center text-[13px] text-subtle">{t("portal.empty")}</td></tr> : null}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-[14px] font-bold text-ink">{t("portal.statement.invoices")}</h2>
      <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[700px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
            <th className="px-5 py-3 text-start font-semibold">{t("portal.statement.col.no")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.statement.col.insurer")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.statement.col.total")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.statement.col.status")}</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {s?.invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-surface-2/60">
                <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{inv.sequenceNo ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-muted">{inv.insurerName ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] tnum font-semibold text-ink">{fmt(inv.totalAmount)} <span className="text-[11px] text-subtle">{t("common.sar")}</span></td>
                <td className="px-5 py-3"><Badge tone="success">{inv.status ?? "—"}</Badge></td>
              </tr>
            ))}
            {s && s.invoices.length === 0 ? <tr><td colSpan={4} className="px-5 py-8 text-center text-[13px] text-subtle">{t("portal.empty")}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </PortalShell>
  );
}
