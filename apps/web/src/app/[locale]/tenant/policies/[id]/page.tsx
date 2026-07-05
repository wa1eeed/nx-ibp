"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, FileCheck2, Coins, ClipboardList, FilePlus2, Receipt, FolderOpen, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api, getToken } from "@/lib/api";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Overview {
  policy: {
    id: string; sequenceNo: string | null; status: string; insurerName: string | null; insurerPolicyNo: string | null;
    productLineCode: string | null; issuanceType: string; issueDate: string | null; startDate: string | null; endDate: string | null;
    sumInsured: string | null; premium: string | null; policyFees: string | null; vat: string | null; totalPremium: string | null;
    commissionRate: string | null; commissionAmount: string | null; producerName: string | null; producerCommission: string | null; paymentTerms: string | null;
  };
  client: { id: string; name: string; type: string; code: string | null } | null;
  endorsements: Array<{ id: string; sequenceNo: string | null; type: string; effectiveDate: string | null; premiumDelta: string | null; status: string; createdAt: string }>;
  claims: Array<{ id: string; sequenceNo: string | null; insurerName: string | null; claimedAmount: string | null; settledAmount: string | null; status: string; incidentDate: string | null; createdAt: string }>;
  debitNotes: Array<{ id: string; sequenceNo: string | null; netAmount: string | null; vatAmount: string | null; createdAt: string }>;
  invoices: Array<{ id: string; sequenceNo: string | null; status: string | null; netAmount: string | null; vatAmount: string | null; totalAmount: string | null; createdAt: string }>;
  documents: Array<{ id: string; fileName: string; docType: string; createdAt: string }>;
  activity: Array<{ action: string; meta: unknown; createdAt: string }>;
  summary: { endorsements: number; claims: number; claimsSettled: number; commission: number; gross: number; outstanding: number };
}

const TABS = ["financial", "endorsements", "claims", "invoices", "documents", "timeline"] as const;
const STATUS_TONE: Record<string, BadgeTone> = { ISSUED: "success", TECHNICAL_REVIEW: "warning", FINANCE_REVIEW: "info", REJECTED: "danger", CANCELLED: "neutral" };
const fmt = (n: string | number | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB") : "—");
const ACTION_AR: Record<string, string> = { create: "إنشاء", update: "تحديث", approve: "اعتماد", issue: "إصدار", revert: "تراجع" };

export default function PolicyDetailPage() {
  const t = useTranslations("policy360");
  const id = String(useParams().id);
  const [ov, setOv] = useState<Overview | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("financial");

  const load = useCallback(async () => {
    try { setOv(await api<Overview>(`/policies/${id}/overview`)); } catch { /* تجاهل */ }
  }, [id]);
  useEffect(() => { if (getToken()) void load(); }, [load]);

  if (!ov) return <div className="grid min-h-[40vh] place-items-center text-subtle">…</div>;
  const p = ov.policy;

  const kpi = (label: string, value: string | number, Icon: typeof Coins) => (
    <div className="rounded-card border border-line bg-card p-3">
      <div className="flex items-center justify-between"><span className="text-[11.5px] text-subtle">{label}</span><Icon size={15} className="text-subtle" /></div>
      <div className="mt-1 text-[19px] font-bold text-ink tnum">{value}</div>
    </div>
  );
  const row = (cells: React.ReactNode[]) => <tr className="border-b border-line last:border-0">{cells.map((x, i) => <td key={i} className="px-3 py-2.5 text-[12.5px] text-ink">{x}</td>)}</tr>;
  const table = (head: string[], rows: React.ReactNode) => (
    <div className="overflow-hidden rounded-card border border-line bg-card"><table className="w-full">
      <thead><tr className="border-b border-line text-[11px] uppercase text-subtle">{head.map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
      <tbody>{rows}</tbody></table></div>
  );
  const empty = <p className="rounded-card border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-subtle">{t("emptyTab")}</p>;
  const money = (label: string, val: string | number | null, strong = false) => (
    <div className="flex items-center justify-between border-b border-line py-2 last:border-0">
      <span className="text-[12.5px] text-subtle">{label}</span>
      <span className={`tnum ${strong ? "text-[14px] font-bold text-ink" : "text-[13px] text-ink"}`}>{fmt(val)}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <Link href="/tenant/policies" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink"><ArrowRight size={14} className="rtl:rotate-180" /> {t("back")}</Link>

      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-bold text-ink tnum">{p.sequenceNo ?? "—"}</h1>
          <p className="text-[12.5px] text-subtle">
            {p.insurerName ?? "—"} · {p.productLineCode ?? "—"}
            {ov.client ? <> · <Link href={`/tenant/clients/${ov.client.id}`} className="text-primary hover:underline">{ov.client.name}</Link></> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {p.insurerPolicyNo ? <span className="text-[11.5px] text-subtle">{t("insurerPolicyNo")}: {p.insurerPolicyNo}</span> : null}
          <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpi(t("kpi.gross"), fmt(ov.summary.gross), Coins)}
        {kpi(t("kpi.commission"), fmt(ov.summary.commission), FileCheck2)}
        {kpi(t("kpi.claims"), ov.summary.claims, ClipboardList)}
        {kpi(t("kpi.endorsements"), ov.summary.endorsements, FilePlus2)}
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-line">
        {TABS.map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-[12.5px] font-medium ${tab === k ? "border-primary text-primary" : "border-transparent text-subtle hover:text-ink"}`}>{t(`tabs.${k}`)}</button>
        ))}
      </div>

      <div>
        {tab === "financial" ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-card border border-line bg-card p-4">
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-subtle">{t("financialTitle")}</div>
              {money(t("sumInsured"), p.sumInsured)}
              {money(t("premium"), p.premium)}
              {money(t("policyFees"), p.policyFees)}
              {money(t("vat"), p.vat)}
              {money(t("totalPremium"), p.totalPremium, true)}
            </div>
            <div className="rounded-card border border-line bg-card p-4">
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-subtle">{t("commissionTitle")}</div>
              {money(`${t("commissionRate")} (${p.commissionRate ?? "—"}%)`, p.commissionAmount)}
              {p.producerName ? money(`${t("producer")}: ${p.producerName}`, p.producerCommission) : null}
              <div className="mt-3 mb-1 text-[12px] font-semibold uppercase tracking-wide text-subtle">{t("coverageTitle")}</div>
              <div className="flex items-center justify-between border-b border-line py-2"><span className="text-[12.5px] text-subtle">{t("period")}</span><span className="text-[12.5px] text-ink tnum">{dt(p.startDate)} → {dt(p.endDate)}</span></div>
              {p.paymentTerms ? <div className="flex items-center justify-between py-2"><span className="text-[12.5px] text-subtle">{t("paymentTerms")}</span><span className="text-[12.5px] text-ink">{p.paymentTerms}</span></div> : null}
            </div>
          </div>
        ) : null}

        {tab === "endorsements" ? (ov.endorsements.length ? table([t("col.ref"), t("col.type"), t("col.effective"), t("col.delta"), t("col.status")], ov.endorsements.map((e) => row([e.sequenceNo ?? "—", e.type, dt(e.effectiveDate), fmt(e.premiumDelta), <Badge key="s" tone="neutral">{e.status}</Badge>]))) : empty) : null}

        {tab === "claims" ? (ov.claims.length ? table([t("col.ref"), t("col.status"), t("col.claimed"), t("col.settled"), t("col.incident")], ov.claims.map((c) => row([c.sequenceNo ?? "—", <Badge key="s" tone={c.status === "SETTLED" ? "success" : c.status === "REJECTED" ? "danger" : "info"}>{c.status}</Badge>, fmt(c.claimedAmount), fmt(c.settledAmount), dt(c.incidentDate)]))) : empty) : null}

        {tab === "invoices" ? (
          <div className="space-y-3">
            {ov.debitNotes.length ? (<div><p className="mb-1.5 text-[12px] font-semibold text-subtle">{t("debitNotes")}</p>{table([t("col.ref"), t("col.net"), t("col.vat"), t("col.date")], ov.debitNotes.map((d) => row([d.sequenceNo ?? "—", fmt(d.netAmount), fmt(d.vatAmount), dt(d.createdAt)])))}</div>) : null}
            {ov.invoices.length ? (<div><p className="mb-1.5 text-[12px] font-semibold text-subtle">{t("taxInvoices")}</p>{table([t("col.ref"), t("col.status"), t("col.total"), t("col.date")], ov.invoices.map((i) => row([i.sequenceNo ?? "—", <Badge key="s" tone="neutral">{i.status ?? "—"}</Badge>, fmt(i.totalAmount), dt(i.createdAt)])))}</div>) : null}
            {!ov.debitNotes.length && !ov.invoices.length ? empty : null}
          </div>
        ) : null}

        {tab === "documents" ? (ov.documents.length ? table([t("col.file"), t("col.docType"), t("col.date")], ov.documents.map((d) => row([<span key="f" className="inline-flex items-center gap-1.5"><FolderOpen size={13} className="text-subtle" /> {d.fileName}</span>, d.docType, dt(d.createdAt)]))) : empty) : null}

        {tab === "timeline" ? (ov.activity.length ? (
          <ol className="space-y-2.5">
            {ov.activity.map((a, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded-card border border-line bg-card px-3 py-2.5">
                <Clock size={14} className="mt-0.5 shrink-0 text-subtle" />
                <div><div className="text-[12.5px] font-medium text-ink">{ACTION_AR[a.action] ?? a.action}</div><div className="text-[11px] text-subtle">{new Date(a.createdAt).toLocaleString("en-GB")}</div></div>
              </li>
            ))}
          </ol>
        ) : empty) : null}
      </div>
    </div>
  );
}
