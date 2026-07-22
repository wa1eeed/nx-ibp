"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, FileCheck2, Wallet2, Clock, TrendingDown, ShieldAlert, Landmark, Percent, CalendarClock, Building2, Mail, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api, getToken } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";

interface Overview {
  insurer: {
    id: string; name: string; nameEn: string | null; status: string; licenseNo: string | null; vatNumber: string | null; nationalAddress: string | null;
    commissionRate: number | null; settlementDays: number | null; bankName: string | null; iban: string | null;
    contactName: string | null; contactEmail: string | null; contactPhone: string | null; notes: string | null;
  };
  stats: { policyCount: number; gwp: number; commissionAccrued: number; commissionReceived: number; commissionOutstanding: number; claimCount: number; claimsSettled: number; settledToInsurer: number };
  policies: Array<{ id: string; sequenceNo: string | null; clientId: string | null; clientName: string | null; status: string; productLineCode: string | null; totalPremium: number; commissionAmount: number; startDate: string | null; endDate: string | null; createdAt: string }>;
  commissions: Array<{ id: string; policyId: string | null; clientName: string | null; productLine: string | null; rate: number | null; amount: number; receivedAmount: number; status: string | null; periodMonth: string | null }>;
  claims: Array<{ id: string; sequenceNo: string | null; clientId: string | null; clientName: string | null; status: string; claimedAmount: number; settledAmount: number; incidentDate: string | null; createdAt: string }>;
  settlements: Array<{ id: string; sequenceNo: string | null; amount: number; reference: string | null; paidDate: string | null; createdAt: string }>;
}

const TABS = ["policies", "commissions", "claims", "settlements"] as const;
const fmt = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB") : "—");
const polTone = (s: string): "success" | "warning" | "danger" | "info" => (s === "ISSUED" ? "success" : s === "CANCELLED" || s === "REJECTED" ? "danger" : "warning");
const claimTone = (s: string): "success" | "warning" | "danger" | "info" => (s === "SETTLED" || s === "CLOSED" ? "success" : s === "REJECTED" ? "danger" : "info");

export default function InsurerDetailPage() {
  const t = useTranslations("insurer360");
  const params = useParams();
  const id = String(params.id);
  const [ov, setOv] = useState<Overview | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("policies");

  const load = useCallback(async () => {
    try { setOv(await api<Overview>(`/insurers/${id}/overview`)); } catch { /* تجاهل */ }
  }, [id]);
  useEffect(() => { if (getToken()) void load(); }, [load]);

  if (!ov) return <div className="grid min-h-[40vh] place-items-center text-subtle">…</div>;
  const i = ov.insurer;
  const s = ov.stats;

  const kpi = (label: string, value: string | number, Icon: typeof FileCheck2, tone = "text-ink") => (
    <div className="rounded-card border border-line bg-card p-3">
      <div className="flex items-center justify-between"><span className="text-[11.5px] text-subtle">{label}</span><Icon size={15} className="text-subtle" /></div>
      <div className={`mt-1 text-[19px] font-bold tnum ${tone}`}>{value}</div>
    </div>
  );
  const row = (rk: string, cells: React.ReactNode[]) => <tr key={rk} className="border-b border-line last:border-0">{cells.map((x, k) => <td key={k} className="px-3 py-2.5 text-[12.5px] text-ink">{x}</td>)}</tr>;
  const table = (head: string[], rows: React.ReactNode) => (
    <div className="overflow-x-auto rounded-card border border-line bg-card">
      <table className="w-full"><thead><tr className="border-b border-line text-[11px] uppercase text-subtle">{head.map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead><tbody>{rows}</tbody></table>
    </div>
  );
  const empty = <p className="rounded-card border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-subtle">{t("emptyTab")}</p>;
  const clientLink = (cid: string | null, name: string | null) => (cid ? <Link href={`/tenant/clients/${cid}`} className="text-primary hover:underline">{name ?? "—"}</Link> : (name ?? "—"));
  const count: Record<(typeof TABS)[number], number> = { policies: ov.policies.length, commissions: ov.commissions.length, claims: ov.claims.length, settlements: ov.settlements.length };

  return (
    <div className="space-y-4">
      <Link href="/tenant/insurers" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink"><ArrowRight size={14} className="rtl:rotate-180" /> {t("back")}</Link>

      {/* الرأس: الاسم + الحالة + الاتفاقية والبنك وجهات الاتصال */}
      <div className="rounded-card border border-line bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-ink">{i.name}</h1>
              <Badge tone={i.status === "active" ? "success" : "warning"}>{t(i.status === "active" ? "active" : "inactive")}</Badge>
            </div>
            {i.nameEn ? <div className="text-[12px] text-subtle" dir="ltr">{i.nameEn}</div> : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-muted">
          {i.commissionRate != null ? <span className="inline-flex items-center gap-1"><Percent size={13} className="text-primary" /> {t("commissionRate")}: {i.commissionRate}%</span> : null}
          {i.settlementDays != null ? <span className="inline-flex items-center gap-1"><CalendarClock size={13} className="text-primary" /> {t("settlement", { days: i.settlementDays })}</span> : null}
          {i.licenseNo ? <span className="inline-flex items-center gap-1" dir="ltr"><Building2 size={13} className="text-primary" /> {i.licenseNo}</span> : null}
          {i.bankName || i.iban ? <span className="inline-flex items-center gap-1" dir="ltr"><Landmark size={13} className="text-primary" /> {i.bankName ?? ""} {i.iban ?? ""}</span> : null}
          {i.contactName ? <span className="inline-flex items-center gap-1">{i.contactName}</span> : null}
          {i.contactEmail ? <a href={`mailto:${i.contactEmail}`} className="inline-flex items-center gap-1 text-primary hover:underline" dir="ltr"><Mail size={13} /> {i.contactEmail}</a> : null}
          {i.contactPhone ? <span className="inline-flex items-center gap-1" dir="ltr"><Phone size={13} className="text-primary" /> {i.contactPhone}</span> : null}
        </div>
      </div>

      {/* مؤشرات المحفظة مع هذه الشركة */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpi(t("kpi.policies"), s.policyCount, FileCheck2)}
        {kpi(t("kpi.gwp"), fmt(s.gwp), Wallet2)}
        {kpi(t("kpi.commissionAccrued"), fmt(s.commissionAccrued), Wallet2)}
        {kpi(t("kpi.commissionReceived"), fmt(s.commissionReceived), Wallet2, "text-success")}
        {kpi(t("kpi.commissionOutstanding"), fmt(s.commissionOutstanding), Clock, s.commissionOutstanding > 0 ? "text-warning" : "text-ink")}
        {kpi(t("kpi.claims"), s.claimCount, ShieldAlert)}
      </div>

      {/* التبويبات */}
      <div className="flex gap-1 border-b border-line">
        {TABS.map((x) => (
          <button key={x} onClick={() => setTab(x)} className={["rounded-t-lg px-3 py-2 text-[12.5px] font-medium transition-colors", tab === x ? "border-b-2 border-primary text-primary" : "text-muted hover:text-ink"].join(" ")}>
            {t(`tabs.${x}`)} <span className="text-[10.5px] text-subtle">({count[x]})</span>
          </button>
        ))}
      </div>

      {tab === "policies" ? (ov.policies.length ? table(
        [t("col.ref"), t("col.client"), t("col.line"), t("col.premium"), t("col.commission"), t("col.status"), t("col.end")],
        ov.policies.map((p) => row(p.id, [
          p.sequenceNo ? <Link key="r" href={`/tenant/policies/${p.id}`} className="font-medium text-primary hover:underline">{p.sequenceNo}</Link> : "—",
          clientLink(p.clientId, p.clientName), p.productLineCode ?? "—",
          <span key="pr" className="tnum">{fmt(p.totalPremium)}</span>, <span key="cm" className="tnum text-success">{fmt(p.commissionAmount)}</span>,
          <Badge key="st" tone={polTone(p.status)}>{p.status}</Badge>, dt(p.endDate),
        ]))) : empty) : null}

      {tab === "commissions" ? (ov.commissions.length ? table(
        [t("col.client"), t("col.line"), t("col.rate"), t("col.accrued"), t("col.received"), t("col.outstanding"), t("col.period"), t("col.ref")],
        ov.commissions.map((c) => row(c.id, [
          c.clientName ?? "—", c.productLine ?? "—", c.rate != null ? `${c.rate}%` : "—",
          <span key="a" className="tnum">{fmt(c.amount)}</span>, <span key="rc" className="tnum text-success">{fmt(c.receivedAmount)}</span>,
          <span key="o" className="tnum text-warning">{fmt(Math.max(0, c.amount - c.receivedAmount))}</span>, c.periodMonth ?? "—",
          c.policyId ? <Link key="p" href={`/tenant/policies/${c.policyId}`} className="text-primary hover:underline">{t("col.policy")}</Link> : "—",
        ]))) : empty) : null}

      {tab === "claims" ? (ov.claims.length ? table(
        [t("col.ref"), t("col.client"), t("col.claimed"), t("col.settled"), t("col.status"), t("col.date")],
        ov.claims.map((c) => row(c.id, [
          c.sequenceNo ? <Link key="r" href={`/tenant/claims/${c.id}`} className="font-medium text-primary hover:underline">{c.sequenceNo}</Link> : "—",
          clientLink(c.clientId, c.clientName), <span key="cl" className="tnum">{fmt(c.claimedAmount)}</span>,
          <span key="se" className="tnum">{fmt(c.settledAmount)}</span>, <Badge key="st" tone={claimTone(c.status)}>{c.status}</Badge>, dt(c.incidentDate ?? c.createdAt),
        ]))) : empty) : null}

      {tab === "settlements" ? (ov.settlements.length ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-surface-2/50 px-3 py-2 text-[12px] text-muted"><TrendingDown size={14} className="text-primary" /> {t("settledTotal")}: <b className="tnum text-ink">{fmt(s.settledToInsurer)}</b> {t("sar")}</div>
          {table(
            [t("col.voucher"), t("col.amount"), t("col.ref"), t("col.paidDate"), t("col.date")],
            ov.settlements.map((v) => row(v.id, [
              <span key="v" className="font-medium tnum">{v.sequenceNo ?? "—"}</span>, <span key="a" className="tnum">{fmt(v.amount)}</span>,
              v.reference ?? "—", dt(v.paidDate), dt(v.createdAt),
            ])))}
        </div>
      ) : empty) : null}
    </div>
  );
}
