"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, RefreshCw, ShieldCheck, Wallet, CalendarClock, FileText, Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cpapi, ApiError } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Policy {
  id: string; sequenceNo: string | null; productLineCode: string | null; insurerName: string | null; insurerPolicyNo: string | null; status: string;
  premium: string | null; vat: string | null; totalPremium: string | null; sumInsured: string | null; startDate: string | null; endDate: string | null;
}
interface Claim { id: string; sequenceNo: string | null; status: string; claimedAmount: string | null; incidentDate: string | null }
interface Doc { id: string; fileName: string; docType: string | null; createdAt: string }
interface Detail { policy: Policy; claims: Claim[]; documents: Doc[] }

const P_TONE: Record<string, BadgeTone> = { ISSUED: "success", TECHNICAL_REVIEW: "warning", FINANCE_REVIEW: "info", REJECTED: "danger", CANCELLED: "neutral" };
const C_TONE: Record<string, BadgeTone> = { RECEIVED: "neutral", UNDER_REVIEW: "warning", SUBMITTED: "info", SETTLED: "success", CLOSED: "neutral", REJECTED: "danger" };

export default function PortalPolicyDetail() {
  const id = String(useParams().id);
  const t = useTranslations();
  const locale = useLocale();
  const [data, setData] = useState<Detail | null>(null);
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { void cpapi<Detail>(`/portal/policies/${id}`).then(setData).catch(() => undefined); }, [id]);

  const fmt = (n: string | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
  const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");

  async function renew() {
    setBusy(true); setDone("");
    try {
      const r = await cpapi<{ sequenceNo: string }>(`/portal/policies/${id}/renew`, { method: "POST" });
      setDone(t("portal.renew.done", { seq: r.sequenceNo }));
    } catch (e) { setDone(e instanceof ApiError ? e.message : "خطأ"); }
    finally { setBusy(false); }
  }

  async function openDoc(docId: string) {
    try {
      const r = await cpapi<{ view: string }>(`/portal/documents/${docId}/url`, { method: "POST" });
      window.open(r.view, "_blank", "noopener");
    } catch { /* ignore */ }
  }

  const p = data?.policy;
  const now = Date.now();
  const daysLeft = p?.endDate ? Math.ceil((new Date(p.endDate).getTime() - now) / 86_400_000) : null;

  return (
    <PortalShell>
      <div className="mb-3">
        <Link href={`/${locale}/portal/policies`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-subtle hover:text-ink">
          <ArrowLeft size={14} /> {t("portal.policyDetail.back")}
        </Link>
      </div>
      <PageHeader
        title={p ? `${t("portal.policyDetail.title")} ${p.sequenceNo ?? ""}` : t("portal.policyDetail.title")}
        subtitle={p?.insurerName ?? undefined}
        actions={p?.status === "ISSUED" ? (
          <button onClick={renew} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">
            <RefreshCw size={15} /> {busy ? "…" : t("portal.renew.action")}
          </button>
        ) : undefined}
      />
      {done ? <p className="mb-3 rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{done}</p> : null}

      {p ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard tone="primary" icon={<ShieldCheck size={18} />} title={t("portal.policyDetail.sumInsured")} value={`${fmt(p.sumInsured)}`} />
            <StatCard tone="info" icon={<Wallet size={18} />} title={t("portal.policyDetail.total")} value={`${fmt(p.totalPremium)}`} />
            <StatCard tone={daysLeft != null && daysLeft <= 60 ? "warning" : "success"} icon={<CalendarClock size={18} />} title={t("portal.policyDetail.daysLeft")} value={daysLeft != null ? daysLeft : "—"} />
            <StatCard tone="info" icon={<FileText size={18} />} title={t("portal.policyDetail.claims")} value={data.claims.length} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-card border border-line bg-card p-5 shadow-card">
              <h2 className="mb-3 text-[13.5px] font-bold text-ink">{t("portal.policyDetail.details")}</h2>
              <dl className="space-y-2 text-[13px]">
                <Row label={t("portal.policyDetail.status")}><Badge tone={P_TONE[p.status] ?? "neutral"}>{p.status}</Badge></Row>
                <Row label={t("portal.policyDetail.product")}>{p.productLineCode ?? "—"}</Row>
                <Row label={t("portal.policyDetail.insurer")}>{p.insurerName ?? "—"}</Row>
                <Row label={t("portal.policyDetail.insurerPolicyNo")}>{p.insurerPolicyNo ?? "—"}</Row>
                <Row label={t("portal.policyDetail.period")}>{date(p.startDate)} — {date(p.endDate)}</Row>
              </dl>
            </div>
            <div className="rounded-card border border-line bg-card p-5 shadow-card">
              <h2 className="mb-3 text-[13.5px] font-bold text-ink">{t("portal.policyDetail.financial")}</h2>
              <dl className="space-y-2 text-[13px]">
                <Row label={t("portal.policyDetail.premium")}>{fmt(p.premium)} {t("common.sar")}</Row>
                <Row label={t("portal.policyDetail.vat")}>{fmt(p.vat)} {t("common.sar")}</Row>
                <Row label={t("portal.policyDetail.total")}><span className="font-semibold text-ink">{fmt(p.totalPremium)} {t("common.sar")}</span></Row>
              </dl>
            </div>
          </div>

          <h2 className="mb-2 mt-6 text-[14px] font-bold text-ink">{t("portal.policyDetail.claims")}</h2>
          <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
            <table className="w-full min-w-[560px]">
              <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.no")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.incident")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.claimed")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.status")}</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {data.claims.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2/60">
                    <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{c.sequenceNo ?? "—"}</td>
                    <td className="px-5 py-3 text-[12px] text-subtle tnum">{date(c.incidentDate)}</td>
                    <td className="px-5 py-3 text-[13px] tnum text-ink">{fmt(c.claimedAmount)}</td>
                    <td className="px-5 py-3"><Badge tone={C_TONE[c.status] ?? "neutral"}>{c.status}</Badge></td>
                  </tr>
                ))}
                {data.claims.length === 0 ? <tr><td colSpan={4} className="px-5 py-8 text-center text-[13px] text-subtle">{t("portal.empty")}</td></tr> : null}
              </tbody>
            </table>
          </div>

          <h2 className="mb-2 mt-6 text-[14px] font-bold text-ink">{t("portal.policyDetail.documents")}</h2>
          <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
            <table className="w-full min-w-[560px]">
              <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-5 py-3 text-start font-semibold">{t("portal.documents.col.file")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("portal.documents.col.type")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("portal.documents.col.date")}</th>
                <th className="px-5 py-3 text-end font-semibold" />
              </tr></thead>
              <tbody className="divide-y divide-line">
                {data.documents.map((d) => (
                  <tr key={d.id} className="hover:bg-surface-2/60">
                    <td className="px-5 py-3 text-[13px] font-medium text-ink">{d.fileName}</td>
                    <td className="px-5 py-3 text-[12.5px] text-muted">{d.docType ?? "—"}</td>
                    <td className="px-5 py-3 text-[12px] text-subtle tnum">{date(d.createdAt)}</td>
                    <td className="px-5 py-3 text-end">
                      <button onClick={() => openDoc(d.id)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2">
                        <Download size={13} /> {t("portal.documents.download")}
                      </button>
                    </td>
                  </tr>
                ))}
                {data.documents.length === 0 ? <tr><td colSpan={4} className="px-5 py-8 text-center text-[13px] text-subtle">{t("portal.empty")}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="rounded-card border border-line bg-card px-5 py-10 text-center text-[13px] text-subtle shadow-card">{t("portal.empty")}</p>
      )}
    </PortalShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-subtle">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
