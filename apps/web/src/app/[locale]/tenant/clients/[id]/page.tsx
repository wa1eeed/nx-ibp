"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, FileCheck2, ClipboardList, FileText, FolderOpen, Receipt, Clock, Send, ShieldOff, UserPlus, Copy, Check, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api, ApiError, getToken } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { LifecycleTimeline } from "@/components/LifecycleTimeline";
import { useConfirm } from "@/components/ui/ConfirmProvider";

// طور كل نوع في الخطّ الزمني للعميل (يقابل ألوان LifecycleTimeline)
const TL_PHASE: Record<string, string> = { policy: "issuance", claim: "service", request: "request", verify: "crm", note: "crm", call: "crm", email: "crm", meeting: "crm", stage_change: "crm" };

interface Overview {
  client: { id: string; name: string; type: string; code: string | null; crNumber: string | null; nationalId: string | null; email: string | null; phone: string | null; city: string | null; vatNumber: string | null; iban: string | null; producerName: string | null; businessActivity: string | null; complianceStatus: string | null; erasedAt: string | null };
  policies: Array<{ id: string; sequenceNo: string | null; productLineCode: string | null; insurerName: string | null; totalPremium: string | null; status: string; endDate: string | null; createdAt: string }>;
  claims: Array<{ id: string; sequenceNo: string | null; insurerName: string | null; claimedAmount: string | null; status: string; createdAt: string }>;
  requests: Array<{ id: string; sequenceNo: string | null; productLineCode: string | null; status: string; createdAt: string }>;
  verifications: Array<{ id: string; checkType: string; riskLevel: string | null; createdAt: string }>;
  debitNotes: Array<{ id: string; sequenceNo: string | null; total: number; settled: number; outstanding: number; status: string; createdAt: string }>;
  creditNotes: Array<{ id: string; sequenceNo: string | null; total: number; createdAt: string }>;
  documents: Array<{ id: string; fileName: string; docType: string; createdAt: string }>;
  activities: Array<{ id: string; type: string; body: string; createdAt: string }>;
  installments: Array<{ id: string; seq: number; dueDate: string; amount: number; settled: number; outstanding: number; status: string; policyId: string | null }>;
  installmentSummary: { count: number; outstanding: number; overdueCount: number; overdueAmount: number; nextDue: { dueDate: string; outstanding: number } | null };
  summary: { policies: number; claims: number; requests: number; documents: number; totalDue: number; collected: number; installmentsOverdue: number };
}

const DN_TONE: Record<string, "warning" | "info" | "success"> = { outstanding: "warning", partial: "info", paid: "success" };
const INST_TONE: Record<string, "success" | "info" | "danger" | "warning"> = { paid: "success", partial: "info", overdue: "danger", due: "warning" };

const TABS = ["overview", "policies", "renewals", "claims", "requests", "documents", "statement", "portal", "timeline"] as const;
const fmt = (n: string | null | number) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB") : "—");
const daysLeft = (end: string | null) => (end == null ? null : Math.ceil((new Date(end).getTime() - Date.now()) / 86400000));

export default function ClientDetailPage() {
  const t = useTranslations("client360");
  const params = useParams();
  const id = String(params.id);
  const confirm = useConfirm();
  const [ov, setOv] = useState<Overview | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("overview");
  const [note, setNote] = useState("");
  const [canErase, setCanErase] = useState(false);

  const load = useCallback(async () => {
    try { setOv(await api<Overview>(`/clients/${id}/overview`)); } catch { /* تجاهل */ }
  }, [id]);
  useEffect(() => { if (getToken()) void load(); }, [load]);
  useEffect(() => {
    if (!getToken()) return;
    void api<{ permissions?: Record<string, { delete?: boolean }> }>("/auth/me")
      .then((me) => setCanErase(me.permissions?.clients?.delete === true))
      .catch(() => undefined);
  }, []);

  async function addNote() {
    if (!note.trim()) return;
    await api("/crm/activities", { method: "POST", body: JSON.stringify({ entityType: "client", entityId: id, type: "note", body: note.trim() }) }).catch(() => undefined);
    setNote(""); await load();
  }

  async function erase() {
    const ok = await confirm({ title: t("erase.title"), description: t("erase.desc"), tone: "danger", confirmLabel: t("erase.action") });
    if (!ok) return;
    await api(`/clients/${id}/erase`, { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
    await load();
  }

  if (!ov) return <div className="grid min-h-[40vh] place-items-center text-subtle">…</div>;
  const c = ov.client;

  const timeline = [
    ...ov.activities.map((a) => ({ date: a.createdAt, label: a.body, kind: a.type })),
    ...ov.policies.map((p) => ({ date: p.createdAt, label: `وثيقة ${p.sequenceNo ?? ""} — ${p.insurerName ?? ""}`, kind: "policy" })),
    ...ov.claims.map((c2) => ({ date: c2.createdAt, label: `مطالبة ${c2.sequenceNo ?? ""}`, kind: "claim" })),
    ...ov.requests.map((r) => ({ date: r.createdAt, label: `طلب ${r.sequenceNo ?? ""}`, kind: "request" })),
    ...ov.verifications.map((v) => ({ date: v.createdAt, label: `تحقّق: ${v.checkType}${v.riskLevel ? ` (${v.riskLevel})` : ""}`, kind: "verify" })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const kpi = (label: string, value: string | number, Icon: typeof FileCheck2) => (
    <div className="rounded-card border border-line bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] text-subtle">{label}</span>
        <Icon size={15} className="text-subtle" />
      </div>
      <div className="mt-1 text-[19px] font-bold text-ink tnum">{value}</div>
    </div>
  );

  const row = (cells: React.ReactNode[]) => <tr className="border-b border-line last:border-0">{cells.map((x, i) => <td key={i} className="px-3 py-2.5 text-[12.5px] text-ink">{x}</td>)}</tr>;
  const table = (head: string[], rows: React.ReactNode) => (
    <div className="overflow-hidden rounded-card border border-line bg-card">
      <table className="w-full"><thead><tr className="border-b border-line text-[11px] uppercase text-subtle">{head.map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead><tbody>{rows}</tbody></table>
    </div>
  );
  const empty = <p className="rounded-card border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-subtle">{t("emptyTab")}</p>;

  return (
    <div className="space-y-4">
      <Link href="/tenant/clients" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink"><ArrowRight size={14} className="rtl:rotate-180" /> {t("back")}</Link>

      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-bold text-ink">{c.name}</h1>
          <p className="text-[12.5px] text-subtle">{c.code} · {c.type === "CORPORATE" ? "منشأة" : "فرد"} {c.city ? `· ${c.city}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {c.complianceStatus ? <Badge tone={c.complianceStatus === "APPROVED" ? "success" : c.complianceStatus === "REJECTED" ? "danger" : "warning"}>{c.complianceStatus}</Badge> : null}
          {c.erasedAt ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-subtle"><ShieldOff size={12} /> {t("erase.badge")}</span>
          ) : canErase ? (
            <button onClick={erase} className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/5 px-3 py-1.5 text-[12px] font-semibold text-danger hover:bg-danger/10">
              <ShieldOff size={14} /> {t("erase.action")}
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpi(t("kpi.policies"), ov.summary.policies, FileCheck2)}
        {kpi(t("kpi.claims"), ov.summary.claims, ClipboardList)}
        {kpi(t("kpi.requests"), ov.summary.requests, FileText)}
        {kpi(t("kpi.due"), fmt(ov.summary.totalDue), Receipt)}
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-line">
        {TABS.map((x) => (
          <button key={x} onClick={() => setTab(x)} className={["rounded-t-lg px-3 py-2 text-[12.5px] font-medium transition-colors", tab === x ? "border-b-2 border-primary text-primary" : "text-muted hover:text-ink"].join(" ")}>{t(`tabs.${x}`)}</button>
        ))}
      </div>

      <div>
        {tab === "overview" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-card border border-line bg-card p-4">
              <h3 className="mb-2 text-[13px] font-bold text-ink">{t("info")}</h3>
              <dl className="space-y-1.5 text-[12.5px]">
                {[[t("cr"), c.crNumber], [t("nid"), c.nationalId], [t("phone"), c.phone], [t("email"), c.email], [t("vat"), c.vatNumber], [t("iban"), c.iban], [t("producer"), c.producerName], [t("activity"), c.businessActivity]].filter(([, v]) => v).map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between gap-3"><dt className="text-subtle">{k}</dt><dd className="font-medium text-ink">{v}</dd></div>
                ))}
              </dl>
            </div>
            <div className="rounded-card border border-line bg-card p-4">
              <h3 className="mb-2 text-[13px] font-bold text-ink">{t("verification")}</h3>
              {ov.verifications.length === 0 ? <p className="text-[12.5px] text-subtle">{t("empty")}</p> : (
                <ul className="space-y-1.5 text-[12.5px]">
                  {ov.verifications.slice(0, 6).map((v) => <li key={v.id} className="flex justify-between"><span className="text-ink">{v.checkType}</span>{v.riskLevel ? <Badge tone={v.riskLevel === "high" ? "danger" : v.riskLevel === "medium" ? "warning" : "success"}>{v.riskLevel}</Badge> : <span className="text-subtle">{dt(v.createdAt)}</span>}</li>)}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {tab === "policies" ? (ov.policies.length ? table([t("status"), t("insurer"), t("premium"), "#"], ov.policies.map((p) => row([<Badge key="s" tone={p.status === "ISSUED" ? "success" : "warning"}>{p.status}</Badge>, p.insurerName ?? "—", fmt(p.totalPremium), p.sequenceNo]))) : empty) : null}
        {tab === "renewals" ? (() => {
          const soon = ov.policies.filter((p) => p.status === "ISSUED" && (daysLeft(p.endDate) ?? 999) <= 90).sort((a, b) => new Date(a.endDate ?? 0).getTime() - new Date(b.endDate ?? 0).getTime());
          return soon.length ? table([t("endDate"), t("daysLeft"), t("insurer"), "#"], soon.map((p) => {
            const dl = daysLeft(p.endDate) ?? 0;
            return row([dt(p.endDate), <Badge key="d" tone={dl < 0 ? "danger" : dl <= 30 ? "danger" : "warning"}>{dl < 0 ? t("expired") : `${dl} ${t("days")}`}</Badge>, p.insurerName ?? "—", p.sequenceNo]);
          })) : <p className="rounded-card border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-subtle">{t("noRenewals")}</p>;
        })() : null}
        {tab === "claims" ? (ov.claims.length ? table([t("status"), t("insurer"), t("amount"), "#"], ov.claims.map((c2) => row([<Badge key="s" tone={c2.status === "SETTLED" ? "success" : c2.status === "REJECTED" ? "danger" : "info"}>{c2.status}</Badge>, c2.insurerName ?? "—", fmt(c2.claimedAmount), c2.sequenceNo]))) : empty) : null}
        {tab === "requests" ? (ov.requests.length ? table([t("status"), t("date"), "#"], ov.requests.map((r) => row([<Badge key="s" tone="neutral">{r.status}</Badge>, dt(r.createdAt), r.sequenceNo]))) : empty) : null}
        {tab === "documents" ? (ov.documents.length ? table([t("date"), "—"], ov.documents.map((d) => row([dt(d.createdAt), <span key="f" className="inline-flex items-center gap-1.5"><FolderOpen size={13} className="text-subtle" /> {d.fileName}</span>]))) : empty) : null}
        {tab === "statement" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-surface-2 py-2"><div className="text-[11px] text-subtle">{t("total")}</div><div className="text-[14px] font-bold text-ink tnum">{fmt(ov.debitNotes.reduce((s, d) => s + d.total, 0))}</div></div>
              <div className="rounded-lg bg-surface-2 py-2"><div className="text-[11px] text-subtle">{t("collected")}</div><div className="text-[14px] font-bold text-success tnum">{fmt(ov.summary.collected)}</div></div>
              <div className="rounded-lg bg-surface-2 py-2"><div className="text-[11px] text-subtle">{t("kpi.due")}</div><div className="text-[14px] font-bold text-warning tnum">{fmt(ov.summary.totalDue)}</div></div>
            </div>
            {ov.debitNotes.length ? (
              <div><p className="mb-1.5 text-[12px] font-semibold text-subtle">{t("debitNotes")}</p>
                {table([t("date"), "#", t("total"), t("settled"), t("outstanding"), t("status")], ov.debitNotes.map((d) => row([dt(d.createdAt), d.sequenceNo, fmt(d.total), <span key="s" className="text-success">{d.settled ? fmt(d.settled) : "—"}</span>, <span key="o" className={d.outstanding > 0 ? "font-medium text-warning" : "text-subtle"}>{fmt(d.outstanding)}</span>, <Badge key="b" tone={DN_TONE[d.status] ?? "neutral"}>{t(`dn.${d.status}`)}</Badge>])))}
              </div>
            ) : empty}
            {ov.creditNotes.length ? (
              <div><p className="mb-1.5 text-[12px] font-semibold text-danger">{t("creditNotes")}</p>
                {table([t("date"), "#", t("amount")], ov.creditNotes.map((c2) => row([dt(c2.createdAt), c2.sequenceNo, <span key="a" className="text-danger">−{fmt(c2.total)}</span>])))}
              </div>
            ) : null}
            {ov.installments.length ? (
              <div>
                <p className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-subtle">
                  {t("installments")}
                  {ov.installmentSummary.overdueCount > 0 ? <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger">{t("instOverdue", { n: ov.installmentSummary.overdueCount })}</span> : null}
                </p>
                {table([t("seq"), t("due"), t("total"), t("settled"), t("outstanding"), t("status")], ov.installments.map((r) => row([
                  r.seq, dt(r.dueDate), fmt(r.amount), <span key="s" className="text-success">{r.settled ? fmt(r.settled) : "—"}</span>,
                  <span key="o" className={r.outstanding > 0 ? "font-medium text-warning" : "text-subtle"}>{fmt(r.outstanding)}</span>,
                  <Badge key="b" tone={INST_TONE[r.status] ?? "neutral"}>{t(`inst.${r.status}`)}</Badge>,
                ])))}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "portal" ? <PortalAccessTab clientId={id} /> : null}

        {tab === "timeline" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addNote()} placeholder={t("addNote")} className="h-9 flex-1 rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <button onClick={() => void addNote()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-semibold text-white hover:opacity-90"><Send size={14} /> {t("add")}</button>
            </div>
            <LifecycleTimeline events={timeline.slice(0, 60).map((e) => ({ at: e.date, phase: TL_PHASE[e.kind] ?? "crm", label: e.label }))} descending />
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface PortalUser { id: string; email: string; fullName: string; activated: boolean; createdAt: string }

/** إدارة دخول بوّابة العميل (للموظف): قائمة المستخدمين + دعوة + رابط تفعيل + إلغاء. */
function PortalAccessTab({ clientId }: { clientId: string }) {
  const t = useTranslations("client360.portal");
  const [users, setUsers] = useState<PortalUser[] | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try { setUsers(await api<PortalUser[]>(`/clients/${clientId}/portal-users`)); } catch { setUsers([]); }
  }, [clientId]);
  useEffect(() => { void load(); }, [load]);

  async function invite() {
    setErr(""); setBusy(true); setLink(""); setCopied(false);
    try {
      const res = await api<{ inviteLink: string }>(`/clients/${clientId}/portal-invite`, { method: "POST", body: JSON.stringify({ email: email.trim(), fullName: fullName.trim() }) });
      setLink(res.inviteLink); setEmail(""); setFullName(""); await load();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); }
    finally { setBusy(false); }
  }
  async function revoke(u: PortalUser) {
    const ok = await confirm({ title: t("revokeTitle"), description: t("revokeDesc", { email: u.email }), tone: "danger", confirmLabel: t("revoke") });
    if (!ok) return;
    await api(`/clients/${clientId}/portal-users/${u.id}/revoke`, { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
    await load();
  }
  function copyLink() { void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }

  const field = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-card p-4">
        <div className="mb-3 flex items-center gap-2"><KeyRound size={16} className="text-primary" /><div><h3 className="text-[13.5px] font-semibold text-ink">{t("inviteTitle")}</h3><p className="text-[11.5px] text-subtle">{t("inviteSub")}</p></div></div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("fullName")} className={field} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("email")} className={`${field} tnum`} />
          <button onClick={invite} disabled={busy || !email.trim() || fullName.trim().length < 2} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><UserPlus size={15} /> {busy ? "…" : t("send")}</button>
        </div>
        {err ? <p className="mt-2 text-[12px] font-medium text-danger">{err}</p> : null}
        {link ? (
          <div className="mt-3 rounded-lg bg-success-soft/50 p-2.5">
            <p className="mb-1 text-[11.5px] font-medium text-success">{t("sent")}</p>
            <div className="flex items-center gap-2">
              <input readOnly value={link} className="h-8 flex-1 rounded-lg border border-line bg-card px-2 text-[11px] text-muted tnum" onFocus={(e) => e.target.select()} />
              <button onClick={copyLink} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-[11.5px] font-medium text-muted hover:bg-surface-2">{copied ? <><Check size={13} className="text-success" /> {t("copied")}</> : <><Copy size={13} /> {t("copy")}</>}</button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-card">
        <table className="w-full"><thead><tr className="border-b border-line text-[11px] uppercase text-subtle">
          <th className="px-3 py-2 text-start font-semibold">{t("user")}</th>
          <th className="px-3 py-2 text-start font-semibold">{t("email")}</th>
          <th className="px-3 py-2 text-center font-semibold">{t("statusCol")}</th>
          <th className="px-3 py-2"></th>
        </tr></thead><tbody>
          {users?.map((u) => (
            <tr key={u.id} className="border-b border-line last:border-0">
              <td className="px-3 py-2.5 text-[12.5px] font-medium text-ink">{u.fullName}</td>
              <td className="px-3 py-2.5 text-[12px] text-muted tnum">{u.email}</td>
              <td className="px-3 py-2.5 text-center"><Badge tone={u.activated ? "success" : "warning"}>{u.activated ? t("active") : t("pending")}</Badge></td>
              <td className="px-3 py-2.5 text-end">{u.activated ? <button onClick={() => revoke(u)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11.5px] font-medium text-danger hover:bg-danger-soft/40"><ShieldOff size={12} /> {t("revoke")}</button> : null}</td>
            </tr>
          ))}
          {users && users.length === 0 ? <tr><td colSpan={4} className="px-3 py-8 text-center text-[12.5px] text-subtle">{t("empty")}</td></tr> : null}
        </tbody></table>
      </div>
    </div>
  );
}
