"use client";

import { useEffect, useState } from "react";
import { Plus, X, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cpapi, ApiError } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Claim {
  id: string; sequenceNo: string | null; insurerName: string | null; incidentDate: string | null; status: string;
  claimedAmount: string | null; deductible: string | null; settledAmount: string | null;
}
interface PolicyLite { id: string; sequenceNo: string | null; insurerName: string | null }

const TONE: Record<string, BadgeTone> = { RECEIVED: "neutral", UNDER_REVIEW: "warning", SUBMITTED: "info", SETTLED: "success", CLOSED: "neutral", REJECTED: "danger" };

export default function PortalClaims() {
  const t = useTranslations();
  const [rows, setRows] = useState<Claim[]>([]);
  const [policies, setPolicies] = useState<PolicyLite[]>([]);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState("");

  const load = () => { void cpapi<Claim[]>("/portal/claims").then(setRows).catch(() => undefined); };
  useEffect(() => { load(); void cpapi<PolicyLite[]>("/portal/policies").then(setPolicies).catch(() => undefined); }, []);

  const fmt = (n: string | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
  const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");

  return (
    <PortalShell>
      <PageHeader title={t("portal.claims.title")} subtitle={t("portal.claims.subtitle")}
        actions={<button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-fg hover:bg-primary"><Plus size={16} /> {t("portal.fileClaim.action")}</button>} />
      {done ? <p className="mb-3 rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{done}</p> : null}
      <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[820px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
            <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.no")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.insurer")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.incident")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.claimed")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.settled")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.claims.col.status")}</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-surface-2/60">
                <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{c.sequenceNo ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-muted">{c.insurerName ?? "—"}</td>
                <td className="px-5 py-3 text-[12px] text-subtle tnum">{date(c.incidentDate)}</td>
                <td className="px-5 py-3 text-[13px] tnum text-ink">{fmt(c.claimedAmount)}</td>
                <td className="px-5 py-3 text-[13px] tnum text-success">{fmt(c.settledAmount)}</td>
                <td className="px-5 py-3"><Badge tone={TONE[c.status] ?? "neutral"}>{c.status}</Badge></td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-[13px] text-subtle">{t("portal.empty")}</td></tr> : null}
          </tbody>
        </table>
      </div>
      {open ? <FileClaim policies={policies} onClose={() => setOpen(false)} onDone={(seq) => { setOpen(false); setDone(t("portal.fileClaim.done", { seq })); load(); }} /> : null}
    </PortalShell>
  );
}

function FileClaim({ policies, onClose, onDone }: { policies: PolicyLite[]; onClose: () => void; onDone: (seq: string) => void }) {
  const t = useTranslations("portal.fileClaim");
  const [policyId, setPolicyId] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [claimedAmount, setClaimedAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    if (!policyId) { setErr(t("pickPolicy")); return; }
    if (description.trim().length < 5) { setErr(t("descRequired")); return; }
    setSaving(true);
    try {
      const c = await cpapi<{ sequenceNo: string }>("/portal/claims", { method: "POST", body: JSON.stringify({ policyId, incidentDate: incidentDate || undefined, claimedAmount: claimedAmount ? Number(claimedAmount) : undefined, description: description.trim() }) });
      onDone(c.sequenceNo);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("title")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("policy")}</span>
            <select value={policyId} onChange={(e) => setPolicyId(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px] text-ink">
              <option value="">—</option>{policies.map((p) => <option key={p.id} value={p.id}>{p.sequenceNo} · {p.insurerName}</option>)}
            </select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("incidentDate")}</span><input type="date" value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px]" /></label>
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("claimedAmount")}</span><input type="number" value={claimedAmount} onChange={(e) => setClaimedAmount(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] tnum" /></label>
          </div>
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
