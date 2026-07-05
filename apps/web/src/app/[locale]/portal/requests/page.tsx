"use client";

import { useEffect, useState } from "react";
import { Plus, X, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cpapi, ApiError } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface PolicyReq { id: string; sequenceNo: string | null; productLineCode: string | null; status: string; createdAt: string }
interface ServiceReq { id: string; sequenceNo: string | null; type: string; subject: string | null; status: string; createdAt: string }
interface PolicyLite { id: string; sequenceNo: string | null; insurerName: string | null }
interface Data { policyRequests: PolicyReq[]; serviceRequests: ServiceReq[] }

const TONE: Record<string, BadgeTone> = { DRAFT: "neutral", QUOTING: "warning", AWARDED: "info", APPROVED: "success", ISSUED: "success", REJECTED: "danger", OPEN: "warning", IN_PROGRESS: "info", SENT_TO_INSURER: "info", CLOSED: "neutral" };
const SERVICE_TYPES = ["certificate", "policy_copy", "amendment", "cancellation", "renewal", "inquiry"] as const;

export default function PortalRequests() {
  const t = useTranslations();
  const [data, setData] = useState<Data | null>(null);
  const [policies, setPolicies] = useState<PolicyLite[]>([]);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState("");
  const load = () => { void cpapi<Data>("/portal/requests").then(setData).catch(() => undefined); };
  useEffect(() => { load(); void cpapi<PolicyLite[]>("/portal/policies").then(setPolicies).catch(() => undefined); }, []);

  const date = (d: string) => new Date(d).toLocaleDateString("en-GB");

  return (
    <PortalShell>
      <PageHeader title={t("portal.requests.title")} subtitle={t("portal.requests.subtitle")}
        actions={<button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-fg hover:bg-primary"><Plus size={16} /> {t("portal.fileService.action")}</button>} />
      {done ? <p className="mb-3 rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{done}</p> : null}

      <h2 className="mb-2 text-[14px] font-bold text-ink">{t("portal.requests.insurance")}</h2>
      <div className="mb-6 overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[640px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.no")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.product")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.date")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.status")}</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {data?.policyRequests.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2/60">
                <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{r.sequenceNo ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-muted">{r.productLineCode ?? "—"}</td>
                <td className="px-5 py-3 text-[12px] text-subtle tnum">{date(r.createdAt)}</td>
                <td className="px-5 py-3"><Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge></td>
              </tr>
            ))}
            {data && data.policyRequests.length === 0 ? <tr><td colSpan={4} className="px-5 py-8 text-center text-[13px] text-subtle">{t("portal.empty")}</td></tr> : null}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-[14px] font-bold text-ink">{t("portal.requests.service")}</h2>
      <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[640px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.no")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.subject")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.date")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.requests.col.status")}</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {data?.serviceRequests.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2/60">
                <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{r.sequenceNo ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-muted">{r.subject ?? r.type}</td>
                <td className="px-5 py-3 text-[12px] text-subtle tnum">{date(r.createdAt)}</td>
                <td className="px-5 py-3"><Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge></td>
              </tr>
            ))}
            {data && data.serviceRequests.length === 0 ? <tr><td colSpan={4} className="px-5 py-8 text-center text-[13px] text-subtle">{t("portal.empty")}</td></tr> : null}
          </tbody>
        </table>
      </div>
      {open ? <FileService policies={policies} onClose={() => setOpen(false)} onDone={(seq) => { setOpen(false); setDone(t("portal.fileService.done", { seq })); load(); }} /> : null}
    </PortalShell>
  );
}

function FileService({ policies, onClose, onDone }: { policies: PolicyLite[]; onClose: () => void; onDone: (seq: string) => void }) {
  const t = useTranslations("portal.fileService");
  const [type, setType] = useState<string>("certificate");
  const [policyId, setPolicyId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setErr(""); setSaving(true);
    try {
      const r = await cpapi<{ sequenceNo: string }>("/portal/service-requests", { method: "POST", body: JSON.stringify({ type, policyId: policyId || undefined, subject: subject || undefined, description: description || undefined }) });
      onDone(r.sequenceNo);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("title")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("type")}</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px] text-ink">
              {SERVICE_TYPES.map((tp) => <option key={tp} value={tp}>{t(`types.${tp}`)}</option>)}
            </select></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("policy")}</span>
            <select value={policyId} onChange={(e) => setPolicyId(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px] text-ink">
              <option value="">—</option>{policies.map((p) => <option key={p.id} value={p.id}>{p.sequenceNo} · {p.insurerName}</option>)}
            </select></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("subject")}</span><input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px]" /></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("description")}</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="h-20 w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px]" /></label>
          {err ? <p className="text-[12px] font-medium text-danger">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("cancel")}</button>
            <button onClick={save} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><Check size={15} /> {saving ? "…" : t("submit")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
