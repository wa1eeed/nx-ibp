"use client";

import { useCallback, useEffect, useState } from "react";
import { Headset, Mail, Phone, Building2, MessageSquare, Check, X, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { papi } from "@/lib/api";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/ui/PageHeader";

interface Lead {
  id: string; name: string; email: string; company: string | null; phone: string | null;
  planCode: string | null; seats: number | null; message: string | null; status: string | null; createdAt: string;
}

const STATUS_TONE: Record<string, string> = {
  new: "bg-warning-soft text-warning",
  contacted: "bg-info-soft text-info",
  closed: "bg-surface-2 text-subtle",
};

export default function AdminLeadsPage() {
  const t = useTranslations("admin.leads");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLeads(await papi<Lead[]>("/platform/leads"));
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  async function setStatus(id: string, status: string) {
    setError("");
    try { await papi(`/platform/leads/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }); await load(); }
    catch { setError(t("error")); }
  }

  const date = (d: string) => new Date(d).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
  const st = (s: string | null) => s ?? "new";

  return (
    <AdminShell>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {leads.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-card py-12 text-center text-[13px] text-subtle">{t("empty")}</div>
      ) : (
        <div className="space-y-3">
          {leads.map((l) => (
            <div key={l.id} className="rounded-card border border-line bg-card p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold text-ink">{l.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STATUS_TONE[st(l.status)]}`}>{t(st(l.status))}</span>
                    {l.planCode ? <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10.5px] font-semibold text-primary-strong">{l.planCode}</span> : null}
                    {l.seats ? <span className="text-[11px] text-subtle tnum">{l.seats} {t("seats")}</span> : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted" dir="ltr">
                    <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1 hover:text-primary"><Mail size={13} /> {l.email}</a>
                    {l.phone ? <span className="inline-flex items-center gap-1"><Phone size={13} /> {l.phone}</span> : null}
                    {l.company ? <span className="inline-flex items-center gap-1"><Building2 size={13} /> {l.company}</span> : null}
                  </div>
                  {l.message ? <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-surface-2/60 px-3 py-2 text-[12.5px] text-ink"><MessageSquare size={14} className="mt-0.5 shrink-0 text-subtle" /> {l.message}</p> : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-[11px] text-subtle tnum">{date(l.createdAt)}</span>
                  <div className="flex items-center gap-1.5">
                    {st(l.status) !== "contacted" ? <button onClick={() => setStatus(l.id, "contacted")} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-medium text-info hover:bg-info-soft"><Check size={13} /> {t("markContacted")}</button> : null}
                    {st(l.status) !== "closed" ? <button onClick={() => setStatus(l.id, "closed")} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-medium text-subtle hover:bg-surface-2"><X size={13} /> {t("markClosed")}</button>
                      : <button onClick={() => setStatus(l.id, "new")} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-medium text-muted hover:bg-surface-2"><RotateCcw size={13} /> {t("reopen")}</button>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
