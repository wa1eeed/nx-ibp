"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Building2, User, FileText, StickyNote, Send, Lock, Eye, ArrowLeftRight, ExternalLink, Flame, Clock } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Client {
  id: string; code: string | null; name: string; type: "CORPORATE" | "INDIVIDUAL";
  crNumber: string | null; nationalId: string | null; vatNumber: string | null;
  email: string | null; phone: string | null; landline: string | null; contactName: string | null;
  city: string | null; nationalAddress: string | null; complianceStatus: "PENDING" | "APPROVED" | "REJECTED"; createdAt: string;
}
interface Policy { id: string; sequenceNo: string | null; productLineCode: string; insurerName: string | null; status: string }
interface Activity { id: string; type: string; visibility: string; body: string; authorId: string | null; authorName: string | null; createdAt: string }
interface SRDetail {
  id: string; sequenceNo: string | null; type: string; subject: string | null; status: string; priority: string;
  assigneeId: string | null; assigneeName: string | null; clientId: string | null; clientName: string | null;
  policyId: string | null; createdAt: string; updatedAt: string; details: Record<string, unknown> | null;
  client: Client | null; policy: Policy | null; timeline: Activity[];
}
interface Staff { id: string; fullName: string }

const TONE: Record<string, BadgeTone> = { OPEN: "warning", IN_PROGRESS: "info", SENT_TO_INSURER: "info", CLOSED: "success" };
const COMPLIANCE_TONE: Record<string, BadgeTone> = { APPROVED: "success", PENDING: "warning", REJECTED: "danger" };
const STATUSES = ["OPEN", "IN_PROGRESS", "SENT_TO_INSURER", "CLOSED"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const PRIO_TONE: Record<string, string> = { urgent: "bg-danger/10 text-danger", high: "bg-warning-soft text-warning", normal: "bg-surface-2 text-subtle", low: "bg-surface-2 text-subtle" };

/** طابع زمني تفصيلي: التاريخ الميلادي + الوقت 24س. */
const fmtTs = (d: string) => {
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} · ${p(x.getHours())}:${p(x.getMinutes())}`;
};

export default function ServiceDetailPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);

  const [d, setD] = useState<SRDetail | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [internal, setInternal] = useState("");
  const [reply, setReply] = useState("");

  const load = useCallback(() => {
    void api<SRDetail>(`/service-requests/${id}`).then(setD).catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    load();
    void api<Staff[]>("/service-requests/staff").then(setStaff).catch(() => setStaff([]));
  }, [load, router]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setErr("");
    try { await fn(); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); }
    finally { setBusy(false); }
  }
  const setStatus = (status: string) => act(() => api(`/service-requests/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }));
  const setPriority = (priority: string) => act(() => api(`/service-requests/${id}/priority`, { method: "POST", body: JSON.stringify({ priority }) }));
  const assign = (assigneeId: string) => act(() => api(`/service-requests/${id}/assign`, { method: "POST", body: JSON.stringify({ assigneeId: assigneeId || null }) }));
  async function addNote(body: string, visibility: "internal" | "client") {
    if (body.trim().length < 1) return;
    await act(() => api(`/service-requests/${id}/notes`, { method: "POST", body: JSON.stringify({ body: body.trim(), visibility }) }));
    if (visibility === "internal") setInternal(""); else setReply("");
  }

  if (notFound) return <div className="grid min-h-[50vh] place-items-center text-muted"><p>{t("service.detail.notFound")}</p></div>;
  if (!d) return <div className="grid min-h-[50vh] place-items-center text-subtle">…</div>;

  const c = d.client;
  const desc = typeof d.details?.description === "string" ? d.details.description : null;
  const viaPortal = d.details?.viaPortal === true;
  const clientType = c ? t(`clients.type.${c.type === "CORPORATE" ? "corporate" : "individual"}`) : "";

  return (
    <div>
      <Link href="/tenant/service" className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink">
        <ArrowRight size={15} /> {t("service.detail.back")}
      </Link>

      <PageHeader
        title={`${d.sequenceNo ?? "—"} · ${t(`service.types.${d.type}`)}`}
        subtitle={d.subject ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <span className={["inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-medium", PRIO_TONE[d.priority]].join(" ")}>
              {d.priority === "urgent" ? <Flame size={12} /> : null}{t(`service.priorities.${d.priority}`)}
            </span>
            <Badge tone={TONE[d.status] ?? "neutral"}>{t(`service.statuses.${d.status}`)}</Badge>
          </div>
        }
      />

      {err ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{err}</p> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* العمود الأيمن: بيانات العميل + تفاصيل الطلب + الإجراءات */}
        <div className="space-y-4 lg:col-span-1">
          {/* صندوق بيانات العميل */}
          <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-line bg-surface-2/40 px-4 py-2.5">
              <h2 className="flex items-center gap-2 text-[13px] font-bold text-ink">
                {c?.type === "CORPORATE" ? <Building2 size={15} className="text-primary" /> : <User size={15} className="text-primary" />}
                {t("service.detail.clientData")}
              </h2>
              {c ? <Link href={`/tenant/clients/${c.id}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">{t("service.detail.viewClient")} <ExternalLink size={11} /></Link> : null}
            </div>
            {c ? (
              <dl className="divide-y divide-line/70 px-4 py-1 text-[12.5px]">
                <Row label={t("service.detail.name")} value={c.name} strong />
                <Row label={t("service.detail.clientType")} value={`${clientType}${c.code ? ` · ${c.code}` : ""}`} />
                {c.type === "CORPORATE" ? <Row label={t("service.detail.cr")} value={c.crNumber} mono /> : <Row label={t("service.detail.nationalId")} value={c.nationalId} mono />}
                {c.vatNumber ? <Row label={t("service.detail.vat")} value={c.vatNumber} mono /> : null}
                <Row label={t("service.detail.contactName")} value={c.contactName} />
                <Row label={t("service.detail.phone")} value={c.phone} mono dir="ltr" />
                <Row label={t("service.detail.landline")} value={c.landline} mono dir="ltr" />
                <Row label={t("service.detail.email")} value={c.email} dir="ltr" />
                <Row label={t("service.detail.city")} value={c.city} />
                <Row label={t("service.detail.address")} value={c.nationalAddress} />
                <div className="flex items-center justify-between py-2">
                  <dt className="text-subtle">{t("service.detail.compliance")}</dt>
                  <dd><Badge tone={COMPLIANCE_TONE[c.complianceStatus]}>{t(`clients.complianceStatus.${c.complianceStatus}`)}</Badge></dd>
                </div>
              </dl>
            ) : <p className="px-4 py-6 text-center text-[12.5px] text-subtle">{t("service.detail.noClient")}</p>}
          </section>

          {/* تفاصيل الطلب */}
          <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
            <div className="border-b border-line bg-surface-2/40 px-4 py-2.5"><h2 className="flex items-center gap-2 text-[13px] font-bold text-ink"><FileText size={15} className="text-primary" /> {t("service.detail.requestData")}</h2></div>
            <dl className="divide-y divide-line/70 px-4 py-1 text-[12.5px]">
              <Row label={t("service.type")} value={t(`service.types.${d.type}`)} />
              <Row label={t("service.subject")} value={d.subject} />
              {d.policy ? (
                <div className="flex items-center justify-between py-2">
                  <dt className="text-subtle">{t("service.detail.policy")}</dt>
                  <dd><Link href={`/tenant/policies/${d.policy.id}`} className="font-medium text-primary hover:underline tnum">{d.policy.sequenceNo ?? d.policy.id.slice(0, 8)}</Link></dd>
                </div>
              ) : null}
              {viaPortal ? <Row label={t("service.detail.via")} value={t("service.detail.viaPortal")} /> : null}
              <Row label={t("service.detail.createdAt")} value={fmtTs(d.createdAt)} mono dir="ltr" />
              <Row label={t("service.detail.updatedAt")} value={fmtTs(d.updatedAt)} mono dir="ltr" />
            </dl>
            {desc ? <div className="border-t border-line px-4 py-3"><p className="mb-1 text-[11px] font-medium text-subtle">{t("service.detail.description")}</p><p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{desc}</p></div> : null}
          </section>

          {/* الإجراءات */}
          <section className="rounded-card border border-line bg-card p-4 shadow-card">
            <div className="grid grid-cols-1 gap-3">
              <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("service.col.status")}</span>
                <select value={d.status} onChange={(e) => setStatus(e.target.value)} disabled={busy} className={FIELD}>{STATUSES.map((s) => <option key={s} value={s}>{t(`service.statuses.${s}`)}</option>)}</select></label>
              <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("service.priority")}</span>
                <select value={d.priority} onChange={(e) => setPriority(e.target.value)} disabled={busy} className={FIELD}>{PRIORITIES.map((p) => <option key={p} value={p}>{t(`service.priorities.${p}`)}</option>)}</select></label>
              <label className="block"><span className="mb-1 block text-[11px] text-muted">{t("service.assignee")}</span>
                <select value={d.assigneeId ?? ""} onChange={(e) => assign(e.target.value)} disabled={busy} className={FIELD}><option value="">{t("service.unassigned")}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</select></label>
            </div>
          </section>
        </div>

        {/* العمود الأيسر: المحادثة والملاحظات */}
        <div className="lg:col-span-2">
          <section className="rounded-card border border-line bg-card p-5 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-ink"><ArrowLeftRight size={16} className="text-primary" /> {t("service.detail.conversation")}</h2>

            {/* مُنشئ الرسائل: ملاحظة داخلية + رد للعميل */}
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* ملاحظة داخلية */}
              <div className="rounded-lg border border-warning/30 bg-warning-soft/30 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-warning"><Lock size={12} /> {t("service.detail.internalNote")}</div>
                <textarea value={internal} onChange={(e) => setInternal(e.target.value)} placeholder={t("service.detail.internalPlaceholder")} rows={2} className="min-h-[44px] w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-warning/30" />
                <button onClick={() => addNote(internal, "internal")} disabled={busy || internal.trim().length < 1} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"><StickyNote size={13} /> {t("service.detail.addInternalNote")}</button>
              </div>
              {/* رد للعميل */}
              <div className="rounded-lg border border-success/30 bg-success-soft/30 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-success"><Eye size={12} /> {t("service.detail.clientReply")}</div>
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("service.detail.replyPlaceholder")} rows={2} className="min-h-[44px] w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-success/30" />
                <button onClick={() => addNote(reply, "client")} disabled={busy || reply.trim().length < 1} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-success px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"><Send size={13} /> {t("service.detail.sendToClient")}</button>
              </div>
            </div>

            {/* الخطّ الزمني */}
            {d.timeline.length ? (
              <ol className="space-y-2.5">
                {d.timeline.map((a) => {
                  const isReply = a.type === "reply" || a.visibility === "client";
                  const isSystem = a.type === "stage_change";
                  return (
                    <li key={a.id} className={["rounded-lg border p-3", isReply ? "border-success/30 bg-success-soft/20" : isSystem ? "border-line bg-surface-2/30" : "border-warning/25 bg-warning-soft/20"].join(" ")}>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-1.5">
                        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                          {isReply ? <Eye size={12} className="text-success" /> : isSystem ? <ArrowLeftRight size={12} className="text-subtle" /> : <Lock size={12} className="text-warning" />}
                          {a.authorName ?? (isSystem ? t("service.detail.systemEvent") : "—")}
                          <span className={["rounded-full px-1.5 py-0.5 text-[9.5px] font-medium", isReply ? "bg-success/15 text-success" : isSystem ? "bg-surface-2 text-subtle" : "bg-warning/15 text-warning"].join(" ")}>
                            {isReply ? t("service.detail.clientBadge") : isSystem ? t("service.detail.systemEvent") : t("service.detail.internalBadge")}
                          </span>
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

const FIELD = "h-9 w-full rounded-lg border border-line bg-card px-2 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";

function Row({ label, value, strong, mono, dir }: { label: string; value: string | null; strong?: boolean; mono?: boolean; dir?: "ltr" | "rtl" }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="shrink-0 text-subtle">{label}</dt>
      <dd className={["min-w-0 truncate text-end", strong ? "font-semibold text-ink" : "text-ink", mono ? "tnum" : ""].join(" ")} dir={dir}>{value}</dd>
    </div>
  );
}
