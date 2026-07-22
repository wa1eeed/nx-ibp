"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, FileText, FileSpreadsheet, FileCheck2, Search, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { usePermissions } from "@/hooks/usePermissions";

interface RequestRow {
  id: string;
  sequenceNo: string | null;
  productLineCode: string;
  status: string;
  createdAt: string;
  client: { id: string; name: string; code: string | null } | null;
}

// مراحل خطّ الإنتاج (Pipeline) — تجميع الحالات في مراحل يتابعها الوسيط
const STAGES = [
  { key: "draft", statuses: ["DRAFT"], tone: "neutral" as BadgeTone },
  { key: "quoting", statuses: ["QUOTING", "UNDER_REVIEW", "FINANCE_REVIEW", "APPROVED"], tone: "info" as BadgeTone },
  { key: "awarded", statuses: ["AWARDED"], tone: "warning" as BadgeTone },
  { key: "issued", statuses: ["ISSUED"], tone: "success" as BadgeTone },
  { key: "rejected", statuses: ["REJECTED"], tone: "danger" as BadgeTone },
] as const;
type StageKey = (typeof STAGES)[number]["key"] | "all";
const stageOf = (s: string) => STAGES.find((st) => (st.statuses as readonly string[]).includes(s))?.key ?? "draft";
const STATUS_TONE: Record<string, BadgeTone> = { DRAFT: "neutral", QUOTING: "info", UNDER_REVIEW: "warning", FINANCE_REVIEW: "info", APPROVED: "success", AWARDED: "warning", ISSUED: "success", REJECTED: "danger" };
const dayOf = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

export default function RequestsPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const router = useRouter();
  const { can } = usePermissions();
  const canCreate = can("sales", "create");
  const canRfq = can("underwriting", "create"); // بدء RFQ = إنشاء كشف اكتتاب
  const canIssue = can("production", "create"); // إصدار الوثيقة = صلاحية الإنتاج
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [stage, setStage] = useState<StageKey>("all");
  const [line, setLine] = useState("all");

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    void api<RequestRow[]>("/requests").then(setRows).catch(() => undefined);
  }, [router]);

  const lines = useMemo(() => [...new Set(rows.map((r) => r.productLineCode))].sort(), [rows]);
  // مطابقة البحث + الفرع (تُطبَّق قبل عدّ المراحل كي يعكس القمعُ نتيجةَ البحث)
  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (line === "all" || r.productLineCode === line) &&
      (!needle || [r.sequenceNo, r.client?.name, r.client?.code].some((v) => (v ?? "").toLowerCase().includes(needle))),
    );
  }, [rows, q, line]);
  const countByStage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of base) { const k = stageOf(r.status); m[k] = (m[k] ?? 0) + 1; }
    return m;
  }, [base]);
  const filtered = useMemo(() => (stage === "all" ? base : base.filter((r) => stageOf(r.status) === stage)), [base, stage]);

  async function startRfq(requestId: string) {
    const ok = await confirm({ title: t("confirm.startRfq.title"), description: t("confirm.startRfq.desc"), confirmLabel: t("confirm.startRfq.action") });
    if (!ok) return;
    setError("");
    try { const slip = await api<{ id: string }>("/slips", { method: "POST", body: JSON.stringify({ requestId }) }); router.push(`/tenant/slips/${slip.id}`); }
    catch (e) { setError(e instanceof ApiError ? e.message : "خطأ"); }
  }

  async function issuePolicy(requestId: string) {
    const ok = await confirm({ title: t("confirm.issuePolicy.title"), description: t("confirm.issuePolicy.desc"), confirmLabel: t("confirm.issuePolicy.action") });
    if (!ok) return;
    setError("");
    try { await api("/policies/issue", { method: "POST", body: JSON.stringify({ requestId }) }); router.push(`/tenant/policies`); }
    catch (e) { setError(e instanceof ApiError ? e.message : "خطأ"); }
  }

  const field = "h-9 rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/25";

  return (
    <div>
      <PageHeader
        title={t("requests.title")}
        subtitle={t("requests.subtitle")}
        actions={canCreate ? (
          <Link href="/tenant/requests/new" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-fg shadow-sm transition-colors hover:bg-primary">
            <Plus size={16} /> {t("requests.new")}
          </Link>
        ) : null}
      />

      {/* قمع المراحل — بطاقات قابلة للنقر تُصفّي القائمة */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <button onClick={() => setStage("all")} className={`rounded-card border p-3 text-start shadow-card transition-colors ${stage === "all" ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-line hover:bg-surface-2"}`}>
          <div className="text-[11px] font-medium text-subtle">{t("requests.stage.all")}</div>
          <div className="tnum text-[18px] font-bold text-ink">{base.length}</div>
        </button>
        {STAGES.map((st) => (
          <button key={st.key} onClick={() => setStage(st.key)} className={`rounded-card border p-3 text-start shadow-card transition-colors ${stage === st.key ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-line hover:bg-surface-2"}`}>
            <div className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${st.tone === "danger" ? "bg-danger" : st.tone === "success" ? "bg-success" : st.tone === "warning" ? "bg-warning" : st.tone === "info" ? "bg-info" : "bg-subtle"}`} /><span className="text-[11px] font-medium text-subtle">{t(`requests.stage.${st.key}`)}</span></div>
            <div className="tnum text-[18px] font-bold text-ink">{countByStage[st.key] ?? 0}</div>
          </button>
        ))}
      </div>

      {/* الفلاتر: بحث + فرع التأمين */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5">
          <Search size={15} className="text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("requests.filters.search")} className="h-9 w-56 bg-transparent text-[13px] text-ink focus:outline-none" />
        </div>
        <select value={line} onChange={(e) => setLine(e.target.value)} className={field}>
          <option value="all">{t("requests.filters.allProducts")}</option>
          {lines.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <span className="ms-auto text-[12px] text-subtle tnum">{t("requests.filters.count", { n: filtered.length })}</span>
      </div>

      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {filtered.length === 0 ? (
        <div className="grid min-h-[34vh] place-items-center rounded-card border border-dashed border-line bg-card text-center shadow-card">
          <div className="text-muted"><FileText size={28} className="mx-auto mb-2 text-subtle" /><p className="text-[13px]">{rows.length === 0 ? t("requests.empty") : t("requests.noMatch")}</p></div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                  <th className="px-5 py-3 text-start font-semibold">{t("requests.col.seq")}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t("requests.col.client")}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t("requests.col.product")}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t("requests.col.status")}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t("requests.col.age")}</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((r) => {
                  const days = dayOf(r.createdAt);
                  const terminal = r.status === "ISSUED" || r.status === "REJECTED";
                  const ageTone = terminal ? "text-subtle" : days > 30 ? "text-danger font-semibold" : days > 14 ? "text-warning font-medium" : "text-muted";
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-surface-2/60">
                      <td className="px-5 py-3 text-[12.5px] font-medium tnum"><Link href={`/tenant/requests/${r.id}`} className="text-ink hover:text-primary hover:underline">{r.sequenceNo ?? "—"}</Link></td>
                      <td className="px-5 py-3 text-[13px] text-ink">{r.client?.name ?? "—"}</td>
                      <td className="px-5 py-3 text-[13px] text-muted">{r.productLineCode}</td>
                      <td className="px-5 py-3"><Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{t(`requests.status.${r.status.toLowerCase()}`)}</Badge></td>
                      <td className={`px-5 py-3 text-[12.5px] tnum ${ageTone}`}><span className="inline-flex items-center gap-1"><Clock size={12} /> {t("requests.ageDays", { n: days })}</span></td>
                      <td className="px-5 py-3 text-end">
                        {r.status === "AWARDED" ? (
                          canIssue ? (
                            <button onClick={() => issuePolicy(r.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-2.5 py-1.5 text-[12px] font-semibold text-primary-fg hover:bg-primary"><FileCheck2 size={13} /> {t("requests.issue")}</button>
                          ) : null
                        ) : !terminal && canRfq ? (
                          <button onClick={() => startRfq(r.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-primary hover:bg-surface-2"><FileSpreadsheet size={13} /> {t("requests.rfq")}</button>
                        ) : null}
                      </td>
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
