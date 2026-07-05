"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, FileCheck2, Coins, ClipboardList, FilePlus2, FolderOpen, Clock, Plus, X, Check, Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api, ApiError, getToken } from "@/lib/api";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const ENDO_TYPES = ["addition", "deletion", "amendment", "cancellation"] as const;

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
  creditNotes: Array<{ id: string; sequenceNo: string | null; kind: string | null; clientId: string | null; insurerName: string | null; netAmount: string | null; vatAmount: string | null; createdAt: string }>;
  invoices: Array<{ id: string; sequenceNo: string | null; kind: string | null; insurerName: string | null; status: string | null; netAmount: string | null; vatAmount: string | null; totalAmount: string | null; createdAt: string }>;
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
  const [endoOpen, setEndoOpen] = useState(false);
  const [endoDone, setEndoDone] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [banner, setBanner] = useState("");
  const [canFinance, setCanFinance] = useState(false);

  const load = useCallback(async () => {
    try { setOv(await api<Overview>(`/policies/${id}/overview`)); } catch { /* تجاهل */ }
  }, [id]);
  useEffect(() => { if (getToken()) void load(); }, [load]);
  useEffect(() => { if (getToken()) void api<{ permissions?: Record<string, { edit?: boolean }> }>("/auth/me").then((m) => setCanFinance(m.permissions?.finance?.edit === true)).catch(() => undefined); }, []);

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
          {p.status === "ISSUED" && canFinance ? (
            <button onClick={() => { setBanner(""); setCancelOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/5 px-3 py-1.5 text-[12px] font-semibold text-danger hover:bg-danger/10"><Ban size={14} /> {t("cancel.action")}</button>
          ) : null}
          <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
        </div>
      </header>
      {banner ? <p className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{banner}</p> : null}

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

        {tab === "endorsements" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] text-subtle">{p.status === "ISSUED" ? "" : t("endo.onlyIssued")}</p>
              {p.status === "ISSUED" ? (
                <button onClick={() => { setEndoDone(""); setEndoOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3 py-1.5 text-[12.5px] font-semibold text-primary-fg hover:bg-primary"><Plus size={15} /> {t("addEndorsement")}</button>
              ) : null}
            </div>
            {endoDone ? <p className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{endoDone}</p> : null}
            {ov.endorsements.length ? table([t("col.ref"), t("col.type"), t("col.effective"), t("col.delta"), t("col.status")], ov.endorsements.map((e) => row([e.sequenceNo ?? "—", (ENDO_TYPES as readonly string[]).includes(e.type) ? t(`endo.types.${e.type}`) : e.type, dt(e.effectiveDate), fmt(e.premiumDelta), <Badge key="s" tone="neutral">{e.status}</Badge>]))) : empty}
          </div>
        ) : null}

        {tab === "claims" ? (ov.claims.length ? table([t("col.ref"), t("col.status"), t("col.claimed"), t("col.settled"), t("col.incident")], ov.claims.map((c) => row([c.sequenceNo ?? "—", <Badge key="s" tone={c.status === "SETTLED" ? "success" : c.status === "REJECTED" ? "danger" : "info"}>{c.status}</Badge>, fmt(c.claimedAmount), fmt(c.settledAmount), dt(c.incidentDate)]))) : empty) : null}

        {tab === "invoices" ? (
          <div className="space-y-3">
            {ov.debitNotes.length ? (<div><p className="mb-1.5 text-[12px] font-semibold text-subtle">{t("debitNotes")}</p>{table([t("col.ref"), t("col.net"), t("col.vat"), t("col.date")], ov.debitNotes.map((d) => row([d.sequenceNo ?? "—", fmt(d.netAmount), fmt(d.vatAmount), dt(d.createdAt)])))}</div>) : null}
            {ov.creditNotes.length ? (<div><p className="mb-1.5 text-[12px] font-semibold text-danger">{t("creditNotes")}</p>{table([t("col.ref"), t("col.party"), t("col.net"), t("col.vat"), t("col.date")], ov.creditNotes.map((c) => row([c.sequenceNo ?? "—", c.kind === "CNC" ? <Badge key="p" tone="info">{t("toInsurer")}{c.insurerName ? ` · ${c.insurerName}` : ""}</Badge> : <Badge key="p" tone="warning">{t("toClient")}</Badge>, <span key="n" className="text-danger">−{fmt(c.netAmount)}</span>, <span key="v" className="text-danger">−{fmt(c.vatAmount)}</span>, dt(c.createdAt)])))}</div>) : null}
            {ov.invoices.length ? (<div><p className="mb-1.5 text-[12px] font-semibold text-subtle">{t("taxInvoices")}</p>{table([t("col.ref"), t("col.party"), t("col.total"), t("col.date")], ov.invoices.map((i) => row([i.sequenceNo ?? "—", i.kind === "FEES" ? <Badge key="p" tone="warning">{t("invFees")} · {t("toClient")}</Badge> : <Badge key="p" tone="info">{t("invCommission")} · {t("toInsurer")}{i.insurerName ? ` · ${i.insurerName}` : ""}</Badge>, fmt(i.totalAmount), dt(i.createdAt)])))}</div>) : null}
            {!ov.debitNotes.length && !ov.invoices.length && !ov.creditNotes.length ? empty : null}
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

      {endoOpen ? <AddEndorsement policyId={id} onClose={() => setEndoOpen(false)} onDone={(seq) => { setEndoOpen(false); setEndoDone(t("endo.done", { seq })); void load(); }} /> : null}
      {cancelOpen ? <CancelPolicy policyId={id} onClose={() => setCancelOpen(false)} onDone={(seq, amount) => { setCancelOpen(false); setBanner(t("cancel.done", { seq, amount })); void load(); }} /> : null}
    </div>
  );
}

function CancelPolicy({ policyId, onClose, onDone }: { policyId: string; onClose: () => void; onDone: (seq: string, amount: string) => void }) {
  const t = useTranslations("policy360");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const field = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";

  async function save() {
    setErr(""); setSaving(true);
    try {
      const r = await api<{ creditNote: string; returnTotal: number }>(`/finance/policies/${policyId}/cancel`, { method: "POST", body: JSON.stringify({ effectiveDate, reason: reason || undefined }) });
      onDone(r.creditNote, Number(r.returnTotal).toLocaleString("en-US"));
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("cancel.title")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <p className="mb-3 text-[12px] text-subtle">{t("cancel.hint")}</p>
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("cancel.effectiveDate")}</span><input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={field} /></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("cancel.reason")}</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} className="h-16 w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px]" /></label>
          {err ? <p className="text-[12px] font-medium text-danger">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("cancel.cancel")}</button>
            <button onClick={save} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-danger px-4 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60"><Ban size={15} /> {saving ? "…" : t("cancel.submit")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddEndorsement({ policyId, onClose, onDone }: { policyId: string; onClose: () => void; onDone: (seq: string) => void }) {
  const t = useTranslations("policy360");
  const [type, setType] = useState<string>("amendment");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setErr(""); setSaving(true);
    try {
      const r = await api<{ sequenceNo: string }>(`/policies/${policyId}/endorsements`, { method: "POST", body: JSON.stringify({ type, effectiveDate: effectiveDate || undefined, premiumDelta: delta ? Number(delta) : undefined, reason: reason || undefined }) });
      onDone(r.sequenceNo);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }

  const field = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("endo.title")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("endo.type")}</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className={field}>
              {ENDO_TYPES.map((tp) => <option key={tp} value={tp}>{t(`endo.types.${tp}`)}</option>)}
            </select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("endo.effectiveDate")}</span><input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={field} /></label>
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("endo.delta")}</span><input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} className={`${field} tnum`} /></label>
          </div>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("endo.reason")}</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} className="h-20 w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px]" /></label>
          {err ? <p className="text-[12px] font-medium text-danger">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("endo.cancel")}</button>
            <button onClick={save} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><Check size={15} /> {saving ? "…" : t("endo.submit")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
