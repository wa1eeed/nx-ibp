"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Search, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { api, getToken } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface SlipRow {
  id: string;
  sequenceNo: string | null;
  status: string;
  createdAt: string;
  presentedAt: string | null;
  clientDecision: string | null;
  request: { id: string; productLineCode: string; client: { id: string; name: string } | null } | null;
  _count: { quotations: number };
}

const STATUSES = ["SENT", "QUOTED", "SELECTED", "CLOSED", "DRAFT"] as const;
const STATUS_TONE: Record<string, BadgeTone> = { DRAFT: "neutral", SENT: "info", QUOTED: "warning", SELECTED: "success", CLOSED: "neutral" };
const DECISION_TONE: Record<string, BadgeTone> = { pending: "warning", accepted: "success", declined: "danger" };
const dayOf = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

export default function UnderwritingQueuePage() {
  const t = useTranslations();
  const router = useRouter();
  const [rows, setRows] = useState<SlipRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    void api<SlipRow[]>("/slips").then(setRows).catch(() => setRows([]));
  }, [router]);

  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => !needle || [r.sequenceNo, r.request?.client?.name, r.request?.productLineCode].some((v) => (v ?? "").toLowerCase().includes(needle)));
  }, [rows, q]);
  const countByStatus = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of base) m[r.status] = (m[r.status] ?? 0) + 1;
    return m;
  }, [base]);
  const filtered = useMemo(() => (status === "all" ? base : base.filter((r) => r.status === status)), [base, status]);

  return (
    <div>
      <PageHeader title={t("underwritingQueue.title")} subtitle={t("underwritingQueue.subtitle")} />

      {/* قمع الحالات — بطاقات قابلة للنقر */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <button onClick={() => setStatus("all")} className={`rounded-card border p-3 text-start shadow-card transition-colors ${status === "all" ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-line hover:bg-surface-2"}`}>
          <div className="text-[11px] font-medium text-subtle">{t("requests.stage.all")}</div>
          <div className="tnum text-[18px] font-bold text-ink">{base.length}</div>
        </button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-card border p-3 text-start shadow-card transition-colors ${status === s ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-line hover:bg-surface-2"}`}>
            <div className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${STATUS_TONE[s] === "success" ? "bg-success" : STATUS_TONE[s] === "warning" ? "bg-warning" : STATUS_TONE[s] === "info" ? "bg-info" : "bg-subtle"}`} /><span className="truncate text-[11px] font-medium text-subtle">{t(`underwriting.status.${s.toLowerCase()}`)}</span></div>
            <div className="tnum text-[18px] font-bold text-ink">{countByStatus[s] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5">
          <Search size={15} className="text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("requests.filters.search")} className="h-9 w-56 bg-transparent text-[13px] text-ink focus:outline-none" />
        </div>
        <span className="ms-auto text-[12px] text-subtle tnum">{t("requests.filters.count", { n: filtered.length })}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="grid min-h-[34vh] place-items-center rounded-card border border-dashed border-line bg-card text-center shadow-card">
          <div className="text-muted"><FileSpreadsheet size={28} className="mx-auto mb-2 text-subtle" /><p className="text-[13px]">{rows.length === 0 ? t("underwritingQueue.empty") : t("requests.noMatch")}</p></div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                  <th className="px-5 py-3 text-start font-semibold">{t("underwritingQueue.col.rfq")}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t("requests.col.client")}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t("requests.col.product")}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t("underwritingQueue.col.quotes")}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t("requests.col.status")}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t("underwritingQueue.col.decision")}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t("requests.col.age")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((r) => {
                  const days = dayOf(r.createdAt);
                  const terminal = r.status === "SELECTED" || r.status === "CLOSED";
                  const ageTone = terminal ? "text-subtle" : days > 14 ? "text-danger font-semibold" : days > 7 ? "text-warning font-medium" : "text-muted";
                  return (
                    <tr key={r.id} className="cursor-pointer transition-colors hover:bg-surface-2/60" onClick={() => router.push(`/tenant/slips/${r.id}`)}>
                      <td className="px-5 py-3 text-[12.5px] font-medium tnum"><Link href={`/tenant/slips/${r.id}`} className="text-ink hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{r.sequenceNo ?? "—"}</Link></td>
                      <td className="px-5 py-3 text-[13px] text-ink">{r.request?.client?.name ?? "—"}</td>
                      <td className="px-5 py-3 text-[13px] text-muted">{r.request?.productLineCode ?? "—"}</td>
                      <td className="px-5 py-3 text-[12.5px] tnum text-ink">{r._count.quotations}</td>
                      <td className="px-5 py-3"><Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{t(`underwriting.status.${r.status.toLowerCase()}`)}</Badge></td>
                      <td className="px-5 py-3 text-[12.5px]">
                        {r.presentedAt
                          ? <Badge tone={DECISION_TONE[r.clientDecision ?? "pending"] ?? "neutral"}>{t(`underwriting.present.decision.${r.clientDecision ?? "pending"}`)}</Badge>
                          : <span className="text-subtle">—</span>}
                      </td>
                      <td className={`px-5 py-3 text-[12.5px] tnum ${ageTone}`}><span className="inline-flex items-center gap-1"><Clock size={12} /> {t("requests.ageDays", { n: days })}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
