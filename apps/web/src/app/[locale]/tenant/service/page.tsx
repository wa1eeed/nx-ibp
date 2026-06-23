"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, X, Headset } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface SR { id: string; sequenceNo: string | null; type: string; subject: string | null; status: string; clientId: string | null; tenantId: string }

const TONE: Record<string, BadgeTone> = { OPEN: "warning", IN_PROGRESS: "info", SENT_TO_INSURER: "info", CLOSED: "success" };
const STATUSES = ["OPEN", "IN_PROGRESS", "SENT_TO_INSURER", "CLOSED"];
const TYPES = ["addition", "deletion", "amendment", "inquiry", "renewal"];

export default function ServicePage() {
  const t = useTranslations();
  const router = useRouter();
  const [rows, setRows] = useState<SR[]>([]);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState("amendment");
  const [subject, setSubject] = useState("");
  const [clientId, setClientId] = useState("");

  const load = useCallback(async () => setRows(await api<SR[]>("/service-requests")), []);
  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    void load().catch(() => undefined);
  }, [load, router]);

  async function create(e: FormEvent) {
    e.preventDefault(); setError("");
    try {
      await api("/service-requests", { method: "POST", body: JSON.stringify({ type, subject: subject || undefined, clientId: clientId || undefined }) });
      setShow(false); setSubject(""); setClientId("");
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "خطأ"); }
  }

  async function setStatus(id: string, status: string) {
    setError("");
    try { await api(`/service-requests/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "خطأ"); }
  }

  return (
    <div>
      <PageHeader title={t("service.title")} subtitle={t("service.subtitle")}
        actions={<button onClick={() => setShow((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-fg hover:bg-primary">{show ? <X size={16} /> : <Plus size={16} />}{show ? t("service.cancel") : t("service.new")}</button>} />

      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {show ? (
        <form onSubmit={create} className="mb-4 grid grid-cols-1 gap-3 rounded-card border border-line bg-card p-5 shadow-card sm:grid-cols-4">
          <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{t("service.type")}</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px]">
              {TYPES.map((x) => <option key={x} value={x}>{t(`service.types.${x}`)}</option>)}
            </select></label>
          <label className="block sm:col-span-2"><span className="mb-1 block text-[12px] font-medium text-muted">{t("service.subject")}</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px]" /></label>
          <div className="flex items-end"><button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary">{t("service.create")}</button></div>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <div className="grid min-h-[40vh] place-items-center rounded-card border border-dashed border-line bg-card text-center shadow-card text-muted"><div><Headset size={28} className="mx-auto mb-2 text-subtle" /><p className="text-[13px]">{t("service.empty")}</p></div></div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <table className="w-full">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("service.col.seq")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("service.col.type")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("service.col.subject")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("service.col.status")}</th>
              <th className="px-5 py-3"></th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{r.sequenceNo ?? "—"}</td>
                  <td className="px-5 py-3 text-[13px] text-muted">{t(`service.types.${r.type}`)}</td>
                  <td className="px-5 py-3 text-[13px] text-ink">{r.subject ?? "—"}</td>
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
