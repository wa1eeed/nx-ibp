"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Building2, User, FileWarning, StickyNote, Send, Lock, Eye, ArrowLeftRight, ExternalLink, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Client {
  id: string; code: string | null; name: string; type: "CORPORATE" | "INDIVIDUAL";
  crNumber: string | null; nationalId: string | null; vatNumber: string | null;
  email: string | null; phone: string | null; landline: string | null; contactName: string | null;
  city: string | null; complianceStatus: "PENDING" | "APPROVED" | "REJECTED";
}
interface Policy { id: string; sequenceNo: string | null; productLineCode: string; insurerName: string | null }
interface Activity { id: string; type: string; visibility: string; body: string; authorId: string | null; authorName: string | null; createdAt: string }
interface Detail {
  id: string; sequenceNo: string | null; status: string; insurerName: string | null;
  claimedAmount: string | null; deductible: string | null; settledAmount: string | null; incidentDate: string | null;
  createdAt: string; details: Record<string, unknown> | null;
  client: Client | null; policy: Policy | null; timeline: Activity[];
}

const TONE: Record<string, BadgeTone> = { RECEIVED: "warning", UNDER_REVIEW: "info", SUBMITTED: "info", SETTLED: "success", CLOSED: "neutral", REJECTED: "danger" };
const COMPLIANCE_TONE: Record<string, BadgeTone> = { APPROVED: "success", PENDING: "warning", REJECTED: "danger" };
const STATUSES = ["RECEIVED", "UNDER_REVIEW", "SUBMITTED", "SETTLED", "CLOSED", "REJECTED"];
const fmtTs = (d: string) => { const x = new Date(d); const p = (n: number) => String(n).padStart(2, "0"); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} · ${p(x.getHours())}:${p(x.getMinutes())}`; };
const fmtNum = (n: string | null) => (n == null ? null : Number(n).toLocaleString("en-US"));
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : null);

export default function ClaimDetailPage() {
  const t = useTranslations();
  const router = useRouter();
  const id = String(useParams().id);
  const [d, setD] = useState<Detail | null>(null);
  const [staff, setStaff] = useState<{ id: string; fullName: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [internal, setInternal] = useState("");
  const [reply, setReply] = useState("");

  const load = useCallback(() => { void api<Detail>(`/claims/${id}`).then(setD).catch(() => setNotFound(true)); }, [id]);
  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    load();
    void api<{ id: string; fullName: string }[]>("/service-requests/staff").then(setStaff).catch(() => setStaff([]));
  }, [load, router]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setErr("");
    try { await fn(); load(); } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); } finally { setBusy(false); }
  }
  const setStatus = (status: string) => act(() => api(`/claims/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }));
  async function addNote(body: string, visibility: "internal" | "client") {
    if (body.trim().length < 1) return;
    await act(() => api(`/claims/${id}/notes`, { method: "POST", body: JSON.stringify({ body: body.trim(), visibility }) }));
    if (visibility === "internal") setInternal(""); else setReply("");
  }

  if (notFound) return <div className="grid min-h-[50vh] place-items-center text-muted"><p>{t("claims.detail.notFound")}</p></div>;
  if (!d) return <div className="grid min-h-[50vh] place-items-center text-subtle">…</div>;
  const c = d.client;
  void staff; // القائمة محمّلة للاتساق مع صفحة الخدمة (الإسناد غير مفعّل للمطالبات هنا)
  const clientType = c ? t(`clients.type.${c.type === "CORPORATE" ? "corporate" : "individual"}`) : "";

  return (
    <div>
      <Link href="/tenant/claims" className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink"><ArrowRight size={15} /> {t("claims.detail.back")}</Link>
      <PageHeader title={`${d.sequenceNo ?? "—"} · ${t("claims.detail.title")}`} subtitle={d.insurerName ?? undefined}
        actions={<Badge tone={TONE[d.status] ?? "neutral"}>{d.status}</Badge>} />
      {err ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{err}</p> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          {/* بيانات العميل */}
          <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-line bg-surface-2/40 px-4 py-2.5">
              <h2 className="flex items-center gap-2 text-[13px] font-bold text-ink">{c?.type === "CORPORATE" ? <Building2 size={15} className="text-primary" /> : <User size={15} className="text-primary" />} {t("service.detail.clientData")}</h2>
              {c ? <Link href={`/tenant/clients/${c.id}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">{t("service.detail.viewClient")} <ExternalLink size={11} /></Link> : null}
            </div>
            {c ? (
              <dl className="divide-y divide-line/70 px-4 py-1 text-[12.5px]">
                <Row label={t("service.detail.name")} value={c.name} strong />
                <Row label={t("service.detail.clientType")} value={`${clientType}${c.code ? ` · ${c.code}` : ""}`} />
                {c.type === "CORPORATE" ? <Row label={t("service.detail.cr")} value={c.crNumber} mono /> : <Row label={t("service.detail.nationalId")} value={c.nationalId} mono />}
                <Row label={t("service.detail.contactName")} value={c.contactName} />
                <Row label={t("service.detail.phone")} value={c.phone} mono dir="ltr" />
                <Row label={t("service.detail.email")} value={c.email} dir="ltr" />
                <div className="flex items-center justify-between py-2"><dt className="text-subtle">{t("service.detail.compliance")}</dt><dd><Badge tone={COMPLIANCE_TONE[c.complianceStatus]}>{t(`clients.complianceStatus.${c.complianceStatus}`)}</Badge></dd></div>
              </dl>
            ) : <p className="px-4 py-6 text-center text-[12.5px] text-subtle">{t("service.detail.noClient")}</p>}
          </section>

          {/* تفاصيل المطالبة */}
          <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
            <div className="border-b border-line bg-surface-2/40 px-4 py-2.5"><h2 className="flex items-center gap-2 text-[13px] font-bold text-ink"><FileWarning size={15} className="text-primary" /> {t("claims.detail.claimData")}</h2></div>
            <dl className="divide-y divide-line/70 px-4 py-1 text-[12.5px]">
              <Row label={t("claims.insurer")} value={d.insurerName} />
              <Row label={t("claims.claimed")} value={fmtNum(d.claimedAmount)} mono />
              <Row label={t("claims.deductible")} value={fmtNum(d.deductible)} mono />
              <Row label={t("claims.settled")} value={fmtNum(d.settledAmount)} mono />
              <Row label={t("claims.incidentDate")} value={fmtDate(d.incidentDate)} mono dir="ltr" />
              {d.policy ? <div className="flex items-center justify-between py-2"><dt className="text-subtle">{t("service.detail.policy")}</dt><dd><Link href={`/tenant/policies/${d.policy.id}`} className="font-medium text-primary hover:underline tnum">{d.policy.sequenceNo ?? d.policy.id.slice(0, 8)}</Link></dd></div> : null}
              <Row label={t("service.detail.createdAt")} value={fmtTs(d.createdAt)} mono dir="ltr" />
            </dl>
          </section>

          {/* الحالة */}
          <section className="rounded-card border border-line bg-card p-4 shadow-card">
            <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("claims.col.status")}</span>
              <select value={d.status} onChange={(e) => setStatus(e.target.value)} disabled={busy} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30">{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          </section>
        </div>

        {/* المحادثة */}
        <div className="lg:col-span-2">
          <section className="rounded-card border border-line bg-card p-5 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-ink"><ArrowLeftRight size={16} className="text-primary" /> {t("service.detail.conversation")}</h2>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-warning/30 bg-warning-soft/30 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-warning"><Lock size={12} /> {t("service.detail.internalNote")}</div>
                <textarea value={internal} onChange={(e) => setInternal(e.target.value)} placeholder={t("service.detail.internalPlaceholder")} rows={2} className="min-h-[44px] w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-warning/30" />
                <button onClick={() => addNote(internal, "internal")} disabled={busy || internal.trim().length < 1} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"><StickyNote size={13} /> {t("service.detail.addInternalNote")}</button>
              </div>
              <div className="rounded-lg border border-success/30 bg-success-soft/30 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-success"><Eye size={12} /> {t("service.detail.clientReply")}</div>
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("service.detail.replyPlaceholder")} rows={2} className="min-h-[44px] w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-success/30" />
                <button onClick={() => addNote(reply, "client")} disabled={busy || reply.trim().length < 1} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-success px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"><Send size={13} /> {t("service.detail.sendToClient")}</button>
              </div>
            </div>
            {d.timeline.length ? (
              <ol className="space-y-2.5">
                {d.timeline.map((a) => {
                  const isReply = a.type === "reply" || a.visibility === "client";
                  return (
                    <li key={a.id} className={["rounded-lg border p-3", isReply ? "border-success/30 bg-success-soft/20" : "border-warning/25 bg-warning-soft/20"].join(" ")}>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-1.5">
                        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                          {isReply ? <Eye size={12} className="text-success" /> : <Lock size={12} className="text-warning" />}
                          {a.authorName ?? "—"}
                          <span className={["rounded-full px-1.5 py-0.5 text-[9.5px] font-medium", isReply ? "bg-success/15 text-success" : "bg-warning/15 text-warning"].join(" ")}>{isReply ? t("service.detail.clientBadge") : t("service.detail.internalBadge")}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10.5px] text-subtle tnum" dir="ltr"><Clock size={10} /> {fmtTs(a.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{a.body}</p>
                    </li>
                  );
                })}
              </ol>
            ) : <p className="py-8 text-center text-[12.5px] text-subtle">{t("service.detail.noActivity")}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong, mono, dir }: { label: string; value: string | null; strong?: boolean; mono?: boolean; dir?: "ltr" | "rtl" }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="shrink-0 text-subtle">{label}</dt>
      <dd className={["min-w-0 truncate text-end", strong ? "font-semibold text-ink" : "text-ink", mono ? "tnum" : ""].join(" ")} dir={dir}>{value}</dd>
    </div>
  );
}
