"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Send, MessagesSquare, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { cpapi, ApiError } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Msg { id: string; body: string; createdAt: string; mine: boolean; authorName: string | null }
interface Detail {
  id: string; sequenceNo: string | null; status: string; insurerName: string | null;
  claimedAmount: string | null; deductible: string | null; settledAmount: string | null; incidentDate: string | null; createdAt: string;
  policy: { id: string; sequenceNo: string | null } | null; timeline: Msg[];
}

const TONE: Record<string, BadgeTone> = { RECEIVED: "warning", UNDER_REVIEW: "info", SUBMITTED: "info", SETTLED: "success", CLOSED: "neutral", REJECTED: "danger" };
const fmtTs = (d: string) => { const x = new Date(d); const p = (n: number) => String(n).padStart(2, "0"); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} · ${p(x.getHours())}:${p(x.getMinutes())}`; };
const fmtNum = (n: string | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");

export default function PortalClaimDetail() {
  const t = useTranslations();
  const id = String(useParams().id);
  const [d, setD] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => { void cpapi<Detail>(`/portal/claims/${id}`).then(setD).catch(() => setNotFound(true)); }, [id]);
  useEffect(() => { load(); }, [load]);

  async function send() {
    if (reply.trim().length < 1) return;
    setBusy(true); setErr("");
    try { await cpapi(`/portal/claims/${id}/reply`, { method: "POST", body: JSON.stringify({ body: reply.trim() }) }); setReply(""); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); } finally { setBusy(false); }
  }

  return (
    <PortalShell>
      <Link href="/portal/claims" className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink"><ArrowRight size={15} /> {t("portal.claimDetail.back")}</Link>
      {notFound ? (
        <div className="grid min-h-[40vh] place-items-center text-muted"><p>{t("portal.claimDetail.notFound")}</p></div>
      ) : !d ? (
        <div className="grid min-h-[40vh] place-items-center text-subtle">…</div>
      ) : (
        <>
          <PageHeader title={`${d.sequenceNo ?? "—"} · ${t("portal.claimDetail.title")}`} subtitle={d.insurerName ?? undefined}
            actions={<Badge tone={TONE[d.status] ?? "neutral"}>{d.status}</Badge>} />

          <div className="mb-4 grid grid-cols-2 gap-3 rounded-card border border-line bg-card p-4 shadow-card sm:grid-cols-4">
            <Meta label={t("portal.claimDetail.claimed")} value={fmtNum(d.claimedAmount)} mono />
            <Meta label={t("portal.claimDetail.settled")} value={fmtNum(d.settledAmount)} mono />
            <Meta label={t("portal.claimDetail.incidentDate")} value={fmtDate(d.incidentDate)} mono />
            {d.policy ? <Meta label={t("portal.serviceDetail.policy")} value={d.policy.sequenceNo ?? "—"} mono /> : <Meta label={t("portal.serviceDetail.createdAt")} value={fmtTs(d.createdAt)} mono />}
          </div>

          <div className="rounded-card border border-line bg-card p-5 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-ink"><MessagesSquare size={16} className="text-primary" /> {t("portal.serviceDetail.conversation")}</h2>
            {d.timeline.length ? (
              <ol className="mb-4 space-y-2.5">
                {d.timeline.map((m) => (
                  <li key={m.id} className={["flex flex-col gap-1 rounded-lg border p-3", m.mine ? "border-primary/25 bg-primary/5 ms-8" : "border-line bg-surface-2/40 me-8"].join(" ")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold text-ink">{m.mine ? t("portal.serviceDetail.you") : (m.authorName ?? t("portal.serviceDetail.team"))}</span>
                      <span className="inline-flex items-center gap-1 text-[10.5px] text-subtle tnum" dir="ltr"><Clock size={10} /> {fmtTs(m.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{m.body}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="mb-4 py-6 text-center text-[12.5px] text-subtle">{t("portal.serviceDetail.noMessages")}</p>}

            {["CLOSED", "REJECTED", "SETTLED"].includes(d.status) ? (
              <p className="rounded-lg bg-surface-2/60 px-3 py-2 text-center text-[12px] text-subtle">{t("portal.claimDetail.closed")}</p>
            ) : (
              <div className="flex items-end gap-2">
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("portal.serviceDetail.replyPlaceholder")} rows={2} className="min-h-[42px] flex-1 rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <button onClick={send} disabled={busy || reply.trim().length < 1} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-50"><Send size={14} /> {t("portal.serviceDetail.send")}</button>
              </div>
            )}
            {err ? <p className="mt-2 text-[12px] font-medium text-danger">{err}</p> : null}
          </div>
        </>
      )}
    </PortalShell>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="mb-0.5 text-[11px] text-subtle">{label}</div>
      <div className={["text-[12.5px] font-medium text-ink", mono ? "tnum" : ""].join(" ")} dir={mono ? "ltr" : undefined}>{value}</div>
    </div>
  );
}
