"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cpapi, ApiError } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Policy {
  id: string; sequenceNo: string | null; productLineCode: string | null; insurerName: string | null; status: string;
  premium: string | null; vat: string | null; totalPremium: string | null; sumInsured: string | null; startDate: string | null; endDate: string | null;
}

const TONE: Record<string, BadgeTone> = { ISSUED: "success", TECHNICAL_REVIEW: "warning", FINANCE_REVIEW: "info", REJECTED: "danger", CANCELLED: "neutral" };

export default function PortalPolicies() {
  const t = useTranslations();
  const locale = useLocale();
  const [rows, setRows] = useState<Policy[]>([]);
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => { void cpapi<Policy[]>("/portal/policies").then(setRows).catch(() => undefined); }, []);

  const fmt = (n: string | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
  const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");

  async function renew(p: Policy) {
    setBusy(p.id); setDone("");
    try {
      const r = await cpapi<{ sequenceNo: string }>(`/portal/policies/${p.id}/renew`, { method: "POST" });
      setDone(t("portal.renew.done", { seq: r.sequenceNo }));
    } catch (e) { setDone(e instanceof ApiError ? e.message : "خطأ"); }
    finally { setBusy(""); }
  }

  return (
    <PortalShell>
      <PageHeader title={t("portal.policies.title")} subtitle={t("portal.policies.subtitle")} />
      {done ? <p className="mb-3 rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{done}</p> : null}
      <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[920px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
            <th className="px-5 py-3 text-start font-semibold">{t("portal.policies.col.no")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.policies.col.product")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.policies.col.insurer")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.policies.col.total")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.policies.col.period")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.policies.col.status")}</th>
            <th className="px-5 py-3 text-end font-semibold">{t("portal.policies.col.actions")}</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-surface-2/60">
                <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">
                  <Link href={`/${locale}/portal/policies/${p.id}`} className="text-primary hover:underline">{p.sequenceNo ?? "—"}</Link>
                </td>
                <td className="px-5 py-3 text-[13px] text-muted">{p.productLineCode ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-muted">{p.insurerName ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] tnum text-ink">{fmt(p.totalPremium)} <span className="text-[11px] text-subtle">{t("common.sar")}</span></td>
                <td className="px-5 py-3 text-[12px] text-subtle tnum">{date(p.startDate)} — {date(p.endDate)}</td>
                <td className="px-5 py-3"><Badge tone={TONE[p.status] ?? "neutral"}>{p.status}</Badge></td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    {p.status === "ISSUED" ? (
                      <button onClick={() => renew(p)} disabled={busy === p.id} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2 disabled:opacity-50">
                        <RefreshCw size={13} /> {busy === p.id ? "…" : t("portal.renew.action")}
                      </button>
                    ) : null}
                    <Link href={`/${locale}/portal/policies/${p.id}`} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2">
                      {t("portal.policies.col.detail")} <ArrowLeft size={13} className="ltr:rotate-180" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-10 text-center text-[13px] text-subtle">{t("portal.empty")}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </PortalShell>
  );
}
