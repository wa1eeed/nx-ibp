"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Wallet2, Clock, TrendingDown, Building2, Receipt, X, Check, FileCheck2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";
import { Link } from "@/i18n/routing";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Row { id: string; policyId: string | null; insurerName: string | null; clientName: string | null; productLine: string | null; rate: string | null; amount: string | null; receivedAmount: string | null; status: string | null }
interface Data { summary: { total: number; received: number; accrued: number; variance: number; receivedPct: number }; rows: Row[] }

const STATUS_TONE: Record<string, BadgeTone> = { received: "success", variance: "danger", accrued: "warning" };
const STATUS_KEY: Record<string, string> = { received: "commissions.status.received", variance: "commissions.status.variance", accrued: "commissions.status.accrued" };

export default function CommissionsPage() {
  const t = useTranslations();
  const { can } = usePermissions();
  const canWrite = can("finance", "edit");
  const [d, setD] = useState<Data | null>(null);
  const [rcv, setRcv] = useState<Row | null>(null);
  const [done, setDone] = useState("");
  const load = useCallback(() => { void api<Data>("/reports/commissions").then(setD).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [load]);

  const fmt = (n: string | number | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
  const variance = (r: Row) => (r.receivedAmount == null ? "—" : fmt(Number(r.amount ?? 0) - Number(r.receivedAmount)));
  const s = d?.summary;

  // تجميع حسب شركة التأمين — للمطابقة والتحصيل من كل مؤمِّن على حدة
  const byInsurer = useMemo(() => {
    const m = new Map<string, { insurer: string; total: number; received: number; count: number }>();
    for (const r of d?.rows ?? []) {
      const key = r.insurerName ?? "—";
      const g = m.get(key) ?? { insurer: key, total: 0, received: 0, count: 0 };
      g.total += Number(r.amount ?? 0);
      g.received += Number(r.receivedAmount ?? 0);
      g.count += 1;
      m.set(key, g);
    }
    return [...m.values()].map((g) => ({ ...g, outstanding: g.total - g.received, pct: g.total ? Math.round((g.received / g.total) * 100) : 0 })).sort((a, b) => b.outstanding - a.outstanding);
  }, [d]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("commissions.title")} subtitle={t("commissions.subtitle")} />
      {done ? <p className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{done}</p> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="primary" icon={<Wallet2 size={18} />} title={t("commissions.kpi.total")} value={<span className="tnum">{s ? fmt(s.total) : "…"}</span>} sub={t("common.sar")} />
        <StatCard tone="success" icon={<Wallet2 size={18} />} title={t("commissions.kpi.received")} value={<span className="tnum">{s ? fmt(s.received) : "…"}</span>} sub={s ? `${s.receivedPct}% ${t("commissions.kpi.receivedSub")}` : ""} />
        <StatCard tone="warning" icon={<Clock size={18} />} title={t("commissions.kpi.pending")} value={<span className="tnum">{s ? fmt(s.accrued) : "…"}</span>} sub={t("common.sar")} />
        <StatCard tone="danger" icon={<TrendingDown size={18} />} title={t("commissions.kpi.variance")} value={<span className="tnum">{s ? fmt(s.variance) : "…"}</span>} sub={t("commissions.kpi.varianceSub")} />
      </div>

      {/* شريط نسبة التحصيل */}
      {s ? (
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <div className="mb-2 flex items-center justify-between text-[12.5px]">
            <span className="font-semibold text-ink">{t("commissions.collectionRate")}</span>
            <span className="tnum text-muted">{fmt(s.received)} / {fmt(s.total)} {t("common.sar")} · <span className="font-semibold text-success">{s.receivedPct}%</span></span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-success transition-all" style={{ width: `${Math.min(100, s.receivedPct)}%` }} /></div>
        </section>
      ) : null}

      {/* حسب شركة التأمين */}
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <Building2 size={17} className="text-primary" />
          <h2 className="text-[15px] font-semibold text-ink">{t("commissions.byInsurer")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.insurer")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("commissions.kpi.total")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("commissions.kpi.received")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("commissions.kpi.pending")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("commissions.collectionRate")}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {byInsurer.map((g) => (
                <tr key={g.insurer} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[13px] font-medium text-ink">{g.insurer} <span className="text-[11px] text-subtle">({g.count})</span></td>
                  <td className="px-5 py-3 text-[13px] text-ink tnum">{fmt(g.total)}</td>
                  <td className="px-5 py-3 text-[13px] text-success tnum">{fmt(g.received)}</td>
                  <td className={`px-5 py-3 text-[13px] tnum ${g.outstanding > 0 ? "font-medium text-warning" : "text-subtle"}`}>{fmt(g.outstanding)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-success" style={{ width: `${g.pct}%` }} /></div>
                      <span className="text-[11.5px] tnum text-muted">{g.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {d && byInsurer.length === 0 ? <tr><td colSpan={5} className="px-5 py-8 text-center text-[13px] text-subtle">{t("commissions.empty")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* التفصيل حسب الوثيقة */}
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="border-b border-line px-5 py-3.5"><h2 className="text-[15px] font-semibold text-ink">{t("commissions.table.client")} · {t("commissions.table.insurer")}</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.client")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.insurer")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.rate")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.amount")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.received")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.variance")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("commissions.table.status")}</th>
                <th className="px-5 py-3 text-end font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d?.rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[13px] font-medium text-ink">{r.clientName ?? "—"}</td>
                  <td className="px-5 py-3 text-[13px] text-muted">{r.insurerName ?? "—"}</td>
                  <td className="px-5 py-3 text-[13px] text-muted tnum">{r.rate ? `${Number(r.rate)}%` : "—"}</td>
                  <td className="px-5 py-3 text-[13px] font-medium text-ink tnum">{fmt(r.amount)}</td>
                  <td className="px-5 py-3 text-[13px] text-subtle tnum">{fmt(r.receivedAmount)}</td>
                  <td className={`px-5 py-3 text-[13px] tnum ${r.status === "variance" ? "font-medium text-danger" : "text-subtle"}`}>{variance(r)}</td>
                  <td className="px-5 py-3">{r.status ? <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{t(STATUS_KEY[r.status] ?? "commissions.status.accrued")}</Badge> : null}</td>
                  <td className="px-5 py-3 text-end">
                    <div className="inline-flex items-center gap-1.5">
                      {r.policyId ? <Link href={`/tenant/policies/${r.policyId}`} title={t("commissions.sourcePolicy")} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-primary hover:bg-surface-2"><FileCheck2 size={13} /> {t("commissions.sourcePolicy")}</Link> : null}
                      {canWrite && r.status !== "received" ? <button onClick={() => { setDone(""); setRcv(r); }} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2"><Receipt size={13} /> {t("commissions.recordReceipt")}</button> : null}
                    </div>
                  </td>
                </tr>
              ))}
              {d && d.rows.length === 0 ? <tr><td colSpan={8} className="px-5 py-10 text-center text-[13px] text-subtle">{t("commissions.empty")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {rcv ? <CommReceipt row={rcv} onClose={() => setRcv(null)} onDone={(seq) => { setRcv(null); setDone(t("commissions.receipt.done", { seq })); load(); }} /> : null}
    </div>
  );
}

function CommReceipt({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: (seq: string) => void }) {
  const t = useTranslations("commissions.receipt");
  const remaining = Number(row.amount ?? 0) - Number(row.receivedAmount ?? 0);
  const [amount, setAmount] = useState(String(remaining > 0 ? remaining : 0));
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const field = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";

  async function save() {
    setErr(""); setSaving(true);
    try {
      const r = await api<{ voucher: { sequenceNo: string } }>(`/finance/commissions/${row.id}/receipt`, { method: "POST", body: JSON.stringify({ amount: Number(amount), reference: reference || undefined }) });
      onDone(r.voucher.sequenceNo);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("title")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <p className="mb-3 text-[12px] text-subtle">{t("from")} {row.insurerName ?? "—"} · {row.clientName ?? "—"}</p>
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("amount")}</span><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} tnum`} /></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("reference")}</span><input value={reference} onChange={(e) => setReference(e.target.value)} className={field} /></label>
          {err ? <p className="text-[12px] font-medium text-danger">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("cancel")}</button>
            <button onClick={save} disabled={saving || !(Number(amount) > 0)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><Check size={15} /> {saving ? "…" : t("submit")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
