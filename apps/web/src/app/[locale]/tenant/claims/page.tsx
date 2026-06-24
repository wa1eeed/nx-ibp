"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, X, ClipboardList, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/ConfirmProvider";

interface Claim { id: string; sequenceNo: string | null; status: string; insurerName: string | null; claimedAmount: string | null; settledAmount: string | null; tenantId: string }

const TONE: Record<string, BadgeTone> = { RECEIVED: "warning", UNDER_REVIEW: "info", SUBMITTED: "info", SETTLED: "success", CLOSED: "neutral", REJECTED: "danger" };
const STATUSES = ["RECEIVED", "UNDER_REVIEW", "SUBMITTED", "SETTLED", "CLOSED", "REJECTED"];

export default function ClaimsPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const router = useRouter();
  const [rows, setRows] = useState<Claim[]>([]);
  const [locked, setLocked] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [v, setV] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try { setRows(await api<Claim[]>("/claims")); setLocked(false); }
    catch (e) { if (e instanceof ApiError && e.status === 403) setLocked(true); }
  }, []);
  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    void load();
  }, [load, router]);

  const num = (k: string) => (v[k] ? Number(v[k]) : undefined);
  async function create(e: FormEvent) {
    e.preventDefault(); setError("");
    try {
      await api("/claims", { method: "POST", body: JSON.stringify({ clientId: v.clientId || undefined, insurerName: v.insurerName || undefined, claimedAmount: num("claimedAmount"), deductible: num("deductible"), incidentDate: v.incidentDate || undefined }) });
      setShow(false); setV({}); await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "خطأ"); }
  }
  async function setStatus(id: string, status: string) {
    const ok = await confirm({
      title: t("confirm.claimStatus.title"),
      description: t("confirm.claimStatus.desc", { status }),
      confirmLabel: t("confirm.claimStatus.action"),
      tone: status === "REJECTED" ? "danger" : "primary",
    });
    if (!ok) { await load(); return; } // إعادة التحميل تُعيد قيمة القائمة المنسدلة
    setError("");
    const body: Record<string, unknown> = { status };
    if (status === "SETTLED") { const a = prompt(t("claims.settledPrompt")); if (a) body.settledAmount = Number(a); }
    try { await api(`/claims/${id}/status`, { method: "POST", body: JSON.stringify(body) }); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "خطأ"); }
  }
  const fmt = (n: string | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
  const F = (k: string, label: string, type = "text") => (
    <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{label}</span>
      <input type={type} value={v[k] ?? ""} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px]" /></label>
  );

  if (locked) {
    return (<div><PageHeader title={t("claims.title")} subtitle={t("claims.subtitle")} />
      <div className="grid min-h-[40vh] place-items-center rounded-card border border-dashed border-line bg-card text-center shadow-card text-muted"><div><Lock size={26} className="mx-auto mb-2 text-subtle" /><p className="text-[13px]">{t("claims.locked")}</p></div></div></div>);
  }

  return (
    <div>
      <PageHeader title={t("claims.title")} subtitle={t("claims.subtitle")}
        actions={<button onClick={() => setShow((x) => !x)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-fg hover:bg-primary">{show ? <X size={16} /> : <Plus size={16} />}{show ? t("claims.cancel") : t("claims.new")}</button>} />
      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      {show ? (
        <form onSubmit={create} className="mb-4 grid grid-cols-1 gap-3 rounded-card border border-line bg-card p-5 shadow-card sm:grid-cols-4">
          {F("insurerName", t("claims.insurer"))}
          {F("claimedAmount", t("claims.claimed"), "number")}
          {F("deductible", t("claims.deductible"), "number")}
          {F("incidentDate", t("claims.incidentDate"), "date")}
          <div className="flex items-end"><button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary">{t("claims.create")}</button></div>
        </form>
      ) : null}
      {rows.length === 0 ? (
        <div className="grid min-h-[40vh] place-items-center rounded-card border border-dashed border-line bg-card text-center shadow-card text-muted"><div><ClipboardList size={28} className="mx-auto mb-2 text-subtle" /><p className="text-[13px]">{t("claims.empty")}</p></div></div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <table className="w-full">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("claims.col.seq")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("claims.insurer")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("claims.claimed")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("claims.settled")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("claims.col.status")}</th>
              <th className="px-5 py-3"></th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{r.sequenceNo ?? "—"}</td>
                  <td className="px-5 py-3 text-[13px] text-ink">{r.insurerName ?? "—"}</td>
                  <td className="px-5 py-3 text-[12.5px] tnum">{fmt(r.claimedAmount)}</td>
                  <td className="px-5 py-3 text-[12.5px] text-muted tnum">{fmt(r.settledAmount)}</td>
                  <td className="px-5 py-3"><Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge></td>
                  <td className="px-5 py-3 text-end">
                    <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} className="h-8 rounded-lg border border-line bg-card px-2 text-[12px]">
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
