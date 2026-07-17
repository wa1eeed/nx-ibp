"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSignature, CheckCircle2, XCircle, Clock, ChevronLeft, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { cpapi, ApiError } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface ProposalRow { id: string; sequenceNo: string | null; productLineCode: string | null; presentedAt: string; decision: string; decidedAt: string | null; options: number }
interface Quotation { id: string; insurerName: string; premium: string | null; policyFees: string | null; vat: string | null; totalPremium: string | null; deductible: string | null; limit: string | null; sumInsured: string | null; validUntil: string | null; generalRemarks: string | null; additionalConditions: string | null }
interface ProposalDetail { id: string; sequenceNo: string | null; presentedAt: string; decision: string; acceptedQuotationId: string | null; decisionNote: string | null; quotations: Quotation[] }

const decisionTone: Record<string, BadgeTone> = { pending: "warning", accepted: "success", declined: "danger" };

export default function PortalProposals() {
  const t = useTranslations();
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [open, setOpen] = useState<ProposalDetail | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(() => { void cpapi<ProposalRow[]>("/portal/proposals").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);

  const openDetail = (id: string) => { setErr(""); void cpapi<ProposalDetail>(`/portal/proposals/${id}`).then(setOpen).catch(() => undefined); };

  async function accept(quotationId: string) {
    if (!open) return;
    setErr(""); setBusy(quotationId);
    try { await cpapi(`/portal/proposals/${open.id}/accept`, { method: "POST", body: JSON.stringify({ quotationId }) }); setOpen(null); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : t("portal.proposals.error")); } finally { setBusy(""); }
  }
  async function decline() {
    if (!open) return;
    setErr(""); setBusy("decline");
    try { await cpapi(`/portal/proposals/${open.id}/decline`, { method: "POST", body: JSON.stringify({}) }); setOpen(null); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : t("portal.proposals.error")); } finally { setBusy(""); }
  }

  const fmt = (n: string | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
  const money = (n: string | null) => (n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");

  return (
    <PortalShell>
      <PageHeader title={t("portal.proposals.title")} subtitle={t("portal.proposals.subtitle")} />

      {!open ? (
        <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-5 py-3 text-start font-semibold">{t("portal.proposals.no")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("portal.proposals.line")}</th>
                <th className="px-4 py-3 text-center font-semibold">{t("portal.proposals.options")}</th>
                <th className="px-4 py-3 text-center font-semibold">{t("portal.proposals.presented")}</th>
                <th className="px-4 py-3 text-center font-semibold">{t("portal.proposals.status")}</th>
                <th className="px-4 py-3"></th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/60">
                    <td className="px-5 py-3 text-[12.5px] font-medium tnum text-ink">{r.sequenceNo ?? r.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-[12.5px] text-muted">{r.productLineCode ?? "—"}</td>
                    <td className="px-4 py-3 text-center text-[12.5px] tnum">{r.options}</td>
                    <td className="px-4 py-3 text-center text-[12px] text-subtle tnum">{date(r.presentedAt)}</td>
                    <td className="px-4 py-3 text-center"><Badge tone={decisionTone[r.decision] ?? "neutral"}>{t(`portal.proposals.decision.${r.decision}`)}</Badge></td>
                    <td className="px-4 py-3 text-end"><button onClick={() => openDetail(r.id)} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-primary hover:bg-surface-2">{t("portal.proposals.review")}</button></td>
                  </tr>
                ))}
                {rows.length === 0 ? <tr><td colSpan={6} className="px-5 py-12 text-center text-[13px] text-subtle">{t("portal.proposals.empty")}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          <button onClick={() => setOpen(null)} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-muted hover:text-ink"><ChevronLeft size={15} /> {t("portal.proposals.back")}</button>
          <div className="flex flex-wrap items-center gap-2">
            <FileSignature size={17} className="text-primary" />
            <h2 className="text-[15px] font-bold text-ink">{open.sequenceNo ?? t("portal.proposals.title")}</h2>
            <Badge tone={decisionTone[open.decision] ?? "neutral"}>{t(`portal.proposals.decision.${open.decision}`)}</Badge>
            {open.decision === "pending" ? <span className="text-[12px] text-subtle">— {t("portal.proposals.pickHint")}</span> : null}
          </div>
          {err ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{err}</p> : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {open.quotations.map((q) => {
              const accepted = open.acceptedQuotationId === q.id;
              return (
                <div key={q.id} className={`rounded-card border p-4 shadow-card ${accepted ? "border-success/40 bg-success-soft/30" : "border-line bg-card"}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[14px] font-bold text-ink"><ShieldCheck size={15} className="text-primary" /> {q.insurerName}</div>
                    {accepted ? <Badge tone="success">{t("portal.proposals.accepted")}</Badge> : null}
                  </div>
                  <dl className="space-y-1.5 text-[12.5px]">
                    <div className="flex justify-between"><dt className="text-muted">{t("portal.proposals.q.premium")}</dt><dd className="text-ink tnum">{money(q.premium)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">{t("portal.proposals.q.fees")}</dt><dd className="text-ink tnum">{money(q.policyFees)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">{t("portal.proposals.q.vat")}</dt><dd className="text-ink tnum">{money(q.vat)}</dd></div>
                    <div className="flex justify-between border-t border-line pt-1.5"><dt className="font-semibold text-ink">{t("portal.proposals.q.total")}</dt><dd className="font-bold text-ink tnum">{money(q.totalPremium)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">{t("portal.proposals.q.deductible")}</dt><dd className="text-ink tnum">{fmt(q.deductible)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">{t("portal.proposals.q.limit")}</dt><dd className="text-ink tnum">{fmt(q.limit)}</dd></div>
                    {q.validUntil ? <div className="flex justify-between"><dt className="text-muted">{t("portal.proposals.q.validUntil")}</dt><dd className="text-ink tnum">{date(q.validUntil)}</dd></div> : null}
                  </dl>
                  {q.generalRemarks ? <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11.5px] text-subtle">{q.generalRemarks}</p> : null}
                  {open.decision === "pending" ? (
                    <button onClick={() => accept(q.id)} disabled={!!busy} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary-strong px-4 py-2 text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">
                      <CheckCircle2 size={15} /> {busy === q.id ? "…" : t("portal.proposals.acceptThis")}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {open.decision === "pending" ? (
            <div className="flex justify-center border-t border-line pt-4">
              <button onClick={decline} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-[12.5px] font-medium text-danger hover:bg-danger-soft/40 disabled:opacity-60">
                <XCircle size={15} /> {busy === "decline" ? "…" : t("portal.proposals.declineAll")}
              </button>
            </div>
          ) : open.decision === "accepted" ? (
            <p className="flex items-center justify-center gap-1.5 rounded-lg bg-success-soft/40 px-4 py-3 text-[12.5px] font-medium text-success"><CheckCircle2 size={15} /> {t("portal.proposals.acceptedNote")}</p>
          ) : (
            <p className="flex items-center justify-center gap-1.5 rounded-lg bg-danger-soft/40 px-4 py-3 text-[12.5px] font-medium text-danger"><Clock size={15} /> {t("portal.proposals.declinedNote")}</p>
          )}
        </div>
      )}
    </PortalShell>
  );
}
