"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cpapi } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface PolicyReq { id: string; sequenceNo: string | null; productLineCode: string | null; status: string; createdAt: string }
interface ServiceReq { id: string; sequenceNo: string | null; type: string; subject: string | null; status: string; createdAt: string }
interface Data { policyRequests: PolicyReq[]; serviceRequests: ServiceReq[] }

const TONE: Record<string, BadgeTone> = { DRAFT: "neutral", QUOTING: "warning", AWARDED: "info", APPROVED: "success", ISSUED: "success", REJECTED: "danger", OPEN: "warning", IN_PROGRESS: "info", SENT_TO_INSURER: "info", CLOSED: "neutral" };

export default function PortalRequests() {
  const t = useTranslations();
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => { void cpapi<Data>("/portal/requests").then(setData).catch(() => undefined); }, []);

  const date = (d: string) => new Date(d).toLocaleDateString("en-GB");

  return (
    <PortalShell>
      <PageHeader title={t("portal.requests.title")} subtitle={t("portal.requests.subtitle")} />

      <h2 className="mb-2 text-[14px] font-bold text-ink">{t("portal.requests.insurance")}</h2>
      <div className="mb-6 overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[640px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.no")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.product")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.date")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.status")}</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {data?.policyRequests.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2/60">
                <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{r.sequenceNo ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-muted">{r.productLineCode ?? "—"}</td>
                <td className="px-5 py-3 text-[12px] text-subtle tnum">{date(r.createdAt)}</td>
                <td className="px-5 py-3"><Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge></td>
              </tr>
            ))}
            {data && data.policyRequests.length === 0 ? <tr><td colSpan={4} className="px-5 py-8 text-center text-[13px] text-subtle">{t("portal.empty")}</td></tr> : null}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-[14px] font-bold text-ink">{t("portal.requests.service")}</h2>
      <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[640px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.no")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.subject")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.date")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.status")}</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {data?.serviceRequests.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2/60">
                <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{r.sequenceNo ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-muted">{r.subject ?? r.type}</td>
                <td className="px-5 py-3 text-[12px] text-subtle tnum">{date(r.createdAt)}</td>
                <td className="px-5 py-3"><Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge></td>
              </tr>
            ))}
            {data && data.serviceRequests.length === 0 ? <tr><td colSpan={4} className="px-5 py-8 text-center text-[13px] text-subtle">{t("portal.empty")}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </PortalShell>
  );
}
