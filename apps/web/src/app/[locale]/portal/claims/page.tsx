"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cpapi } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Claim {
  id: string; sequenceNo: string | null; insurerName: string | null; incidentDate: string | null; status: string;
  claimedAmount: string | null; deductible: string | null; settledAmount: string | null;
}

const TONE: Record<string, BadgeTone> = { RECEIVED: "neutral", UNDER_REVIEW: "warning", SUBMITTED: "info", SETTLED: "success", CLOSED: "neutral", REJECTED: "danger" };

export default function PortalClaims() {
  const t = useTranslations();
  const [rows, setRows] = useState<Claim[]>([]);
  useEffect(() => { void cpapi<Claim[]>("/portal/claims").then(setRows).catch(() => undefined); }, []);

  const fmt = (n: string | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
  const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");

  return (
    <PortalShell>
      <PageHeader title={t("portal.claims.title")} subtitle={t("portal.claims.subtitle")} />
      <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[820px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
            <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.no")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.insurer")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.incident")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.claimed")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.settled")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.status")}</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-surface-2/60">
                <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{c.sequenceNo ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-muted">{c.insurerName ?? "—"}</td>
                <td className="px-5 py-3 text-[12px] text-subtle tnum">{date(c.incidentDate)}</td>
                <td className="px-5 py-3 text-[13px] tnum text-ink">{fmt(c.claimedAmount)}</td>
                <td className="px-5 py-3 text-[13px] tnum text-success">{fmt(c.settledAmount)}</td>
                <td className="px-5 py-3"><Badge tone={TONE[c.status] ?? "neutral"}>{c.status}</Badge></td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-[13px] text-subtle">{t("portal.empty")}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </PortalShell>
  );
}
