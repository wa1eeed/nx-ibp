"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, Users, AlertTriangle, Wallet2, X, Check, Receipt } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface ByClient { clientId: string; clientName: string; total: number; count: number }
interface Note { id: string; sequenceNo: string | null; clientId: string | null; clientName: string; total: number; settled: number; outstanding: number; status: string; createdAt: string }
interface Data { outstanding: number; collected: number; byClient: ByClient[]; notes: Note[] }

const DAY = 86_400_000;
const STATUS_TONE: Record<string, BadgeTone> = { outstanding: "warning", partial: "info", paid: "success" };

export default function PremiumsPage() {
  const t = useTranslations();
  const { can } = usePermissions();
  const canWrite = can("finance", "edit");
  const [d, setD] = useState<Data | null>(null);
  const [pay, setPay] = useState<Note | null>(null);
  const [stmt, setStmt] = useState<{ id: string; name: string } | null>(null);
  const [done, setDone] = useState("");

  const load = useCallback(() => { void api<Data>("/finance/receivables").then(setD).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [load]);

  const fmt = (n: number) => n.toLocaleString("en-US");
  const date = (s: string) => new Date(s).toLocaleDateString("en-GB");

  // أعمار الذمم على المبلغ المتبقّي (غير المُحصَّل) فقط
  const aging = useMemo(() => {
    const now = Date.now();
    const m = new Map<string, { id: string | null; name: string; b: [number, number, number, number]; total: number; count: number }>();
    for (const n of d?.notes ?? []) {
      if (n.outstanding <= 0) continue;
      const days = (now - new Date(n.createdAt).getTime()) / DAY;
      const i = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
      const key = n.clientId ?? n.clientName;
      const g = m.get(key) ?? { id: n.clientId, name: n.clientName, b: [0, 0, 0, 0], total: 0, count: 0 };
      g.b[i] += n.outstanding; g.total += n.outstanding; g.count += 1;
      m.set(key, g);
    }
    const rows = [...m.values()].sort((a, b) => b.b[3] - a.b[3] || b.total - a.total);
    const totals = rows.reduce((acc, r) => { r.b.forEach((v, i) => (acc.b[i] += v)); acc.total += r.total; return acc; }, { b: [0, 0, 0, 0] as number[], total: 0 });
    return { rows, totals };
  }, [d]);

  const overdue = aging.totals.b[2] + aging.totals.b[3];

  return (
    <div className="space-y-6">
      <PageHeader title={t("premiums.title")} subtitle={t("premiums.subtitle")} />
      {done ? <p className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{done}</p> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="danger" icon={<Coins size={18} />} title={t("premiums.outstanding")} value={<span className="tnum">{d ? fmt(d.outstanding) : "…"}</span>} sub={t("common.sar")} />
        <StatCard tone="success" icon={<Wallet2 size={18} />} title={t("premiums.collected")} value={<span className="tnum">{d ? fmt(d.collected) : "…"}</span>} sub={t("common.sar")} />
        <StatCard tone="warning" icon={<AlertTriangle size={18} />} title={t("premiums.overdue")} value={<span className="tnum">{d ? fmt(overdue) : "…"}</span>} sub={t("premiums.over60")} />
        <StatCard tone="info" icon={<Users size={18} />} title={t("premiums.clients")} value={aging.rows.length || "…"} />
      </div>

      {/* أعمار الذمم المدينة */}
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="border-b border-line px-5 py-3.5"><h2 className="text-[15px] font-semibold text-ink">{t("premiums.aging")}</h2><p className="text-[12px] text-subtle">{t("premiums.agingSub")}</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("premiums.col.client")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("premiums.bucket.current")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("premiums.bucket.d60")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("premiums.bucket.d90")}</th>
              <th className="px-5 py-3 text-end font-semibold text-danger">{t("premiums.bucket.over")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("premiums.col.total")}</th>
              <th className="px-5 py-3 text-end font-semibold" />
            </tr></thead>
            <tbody className="divide-y divide-line">
              {aging.rows.map((r) => (
                <tr key={r.name} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[13px] font-medium text-ink">{r.name} <span className="text-[11px] text-subtle">({r.count})</span></td>
                  <td className="px-5 py-3 text-end text-[13px] text-muted tnum">{r.b[0] ? fmt(r.b[0]) : "—"}</td>
                  <td className="px-5 py-3 text-end text-[13px] text-muted tnum">{r.b[1] ? fmt(r.b[1]) : "—"}</td>
                  <td className="px-5 py-3 text-end text-[13px] text-warning tnum">{r.b[2] ? fmt(r.b[2]) : "—"}</td>
                  <td className={`px-5 py-3 text-end text-[13px] tnum ${r.b[3] ? "font-semibold text-danger" : "text-subtle"}`}>{r.b[3] ? fmt(r.b[3]) : "—"}</td>
                  <td className="px-5 py-3 text-end text-[13px] font-semibold text-ink tnum">{fmt(r.total)}</td>
                  <td className="px-5 py-3 text-end">{r.id ? <button onClick={() => setStmt({ id: r.id!, name: r.name })} className="rounded-lg border border-line px-2.5 py-1 text-[11.5px] font-medium text-muted hover:bg-surface-2">{t("premiums.statementBtn")}</button> : null}</td>
                </tr>
              ))}
              {d && aging.rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-8 text-center text-[13px] text-subtle">{t("portal.empty")}</td></tr> : null}
            </tbody>
            {aging.rows.length ? (
              <tfoot><tr className="border-t-2 border-line bg-surface-2/40 text-[13px] font-bold text-ink">
                <td className="px-5 py-3">{t("premiums.totalRow")}</td>
                <td className="px-5 py-3 text-end tnum">{fmt(aging.totals.b[0])}</td>
                <td className="px-5 py-3 text-end tnum">{fmt(aging.totals.b[1])}</td>
                <td className="px-5 py-3 text-end tnum text-warning">{fmt(aging.totals.b[2])}</td>
                <td className="px-5 py-3 text-end tnum text-danger">{fmt(aging.totals.b[3])}</td>
                <td className="px-5 py-3 text-end tnum">{fmt(aging.totals.total)}</td>
                <td />
              </tr></tfoot>
            ) : null}
          </table>
        </div>
      </section>

      {/* إشعارات المدين + التحصيل */}
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="border-b border-line px-5 py-3.5"><h2 className="text-[15px] font-semibold text-ink">{t("premiums.debitNotes")}</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("premiums.col.no")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("premiums.col.client")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("premiums.col.total")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("premiums.colx.settled")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("premiums.colx.outstanding")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("premiums.colx.status")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("premiums.colx.actions")}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {d?.notes.map((n) => (
                <tr key={n.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{n.sequenceNo ?? "—"}</td>
                  <td className="px-5 py-3 text-[13px] text-ink">{n.clientName}</td>
                  <td className="px-5 py-3 text-end text-[13px] text-ink tnum">{fmt(n.total)}</td>
                  <td className="px-5 py-3 text-end text-[13px] text-success tnum">{n.settled ? fmt(n.settled) : "—"}</td>
                  <td className={`px-5 py-3 text-end text-[13px] tnum ${n.outstanding > 0 ? "font-medium text-warning" : "text-subtle"}`}>{fmt(n.outstanding)}</td>
                  <td className="px-5 py-3"><Badge tone={STATUS_TONE[n.status] ?? "neutral"}>{t(`premiums.status.${n.status}`)}</Badge></td>
                  <td className="px-5 py-3 text-end">
                    {canWrite && n.status !== "paid" ? <button onClick={() => { setDone(""); setPay(n); }} className="inline-flex items-center gap-1 rounded-lg bg-primary-strong px-2.5 py-1.5 text-[12px] font-semibold text-primary-fg hover:bg-primary"><Receipt size={13} /> {t("premiums.recordPayment")}</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {pay ? <RecordReceipt note={pay} onClose={() => setPay(null)} onDone={(seq) => { setPay(null); setDone(t("premiums.receipt.done", { seq })); load(); }} /> : null}
      {stmt ? <Statement clientId={stmt.id} name={stmt.name} onClose={() => setStmt(null)} /> : null}
    </div>
  );
}

function RecordReceipt({ note, onClose, onDone }: { note: Note; onClose: () => void; onDone: (seq: string) => void }) {
  const t = useTranslations("premiums.receipt");
  const [amount, setAmount] = useState(String(note.outstanding));
  const [method, setMethod] = useState("transfer");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const field = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";

  async function save() {
    setErr(""); setSaving(true);
    try {
      const r = await api<{ voucher: { sequenceNo: string } }>(`/finance/debit-notes/${note.id}/receipt`, { method: "POST", body: JSON.stringify({ amount: Number(amount), method, reference: reference || undefined }) });
      onDone(r.voucher.sequenceNo);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("title")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <p className="mb-3 text-[12px] text-subtle">{t("on")} {note.sequenceNo} · {note.clientName} · <span className="tnum text-warning">{note.outstanding.toLocaleString("en-US")}</span></p>
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("amount")}</span><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} tnum`} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("method")}</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
                {["cash", "transfer", "cheque", "card", "pos"].map((m) => <option key={m} value={m}>{t(`methods.${m}`)}</option>)}
              </select></label>
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("reference")}</span><input value={reference} onChange={(e) => setReference(e.target.value)} className={field} /></label>
          </div>
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

interface StatementData { client: { name: string }; rows: Array<{ date: string; kind: string; ref: string | null; debit: number; credit: number; balance: number }>; summary: { charged: number; paid: number; balance: number } }

function Statement({ clientId, name, onClose }: { clientId: string; name: string; onClose: () => void }) {
  const t = useTranslations("premiums.statement");
  const [d, setD] = useState<StatementData | null>(null);
  useEffect(() => { void api<StatementData>(`/finance/statement/${clientId}`).then(setD).catch(() => undefined); }, [clientId]);
  const fmt = (n: number) => n.toLocaleString("en-US");
  const date = (s: string) => new Date(s).toLocaleDateString("en-GB");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-2xl rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("title")} · {name}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        {d ? (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-surface-2 py-2"><div className="text-[11px] text-subtle">{t("charged")}</div><div className="text-[14px] font-bold text-ink tnum">{fmt(d.summary.charged)}</div></div>
              <div className="rounded-lg bg-surface-2 py-2"><div className="text-[11px] text-subtle">{t("paid")}</div><div className="text-[14px] font-bold text-success tnum">{fmt(d.summary.paid)}</div></div>
              <div className="rounded-lg bg-surface-2 py-2"><div className="text-[11px] text-subtle">{t("balance")}</div><div className="text-[14px] font-bold text-warning tnum">{fmt(d.summary.balance)}</div></div>
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-lg border border-line">
              <table className="w-full">
                <thead className="sticky top-0 bg-card"><tr className="border-b border-line text-[11px] uppercase text-subtle">
                  <th className="px-3 py-2 text-start font-semibold">{t("date")}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t("desc")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("debit")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("credit")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("balanceCol")}</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {d.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-[12px] text-subtle tnum">{date(r.date)}</td>
                      <td className="px-3 py-2 text-[12.5px] text-ink">{r.kind === "charge" ? t("charge") : t("payment")} {r.ref ? <span className="text-subtle tnum">· {r.ref}</span> : null}</td>
                      <td className="px-3 py-2 text-end text-[12.5px] tnum text-ink">{r.debit ? fmt(r.debit) : "—"}</td>
                      <td className="px-3 py-2 text-end text-[12.5px] tnum text-success">{r.credit ? fmt(r.credit) : "—"}</td>
                      <td className="px-3 py-2 text-end text-[12.5px] font-medium tnum text-ink">{fmt(r.balance)}</td>
                    </tr>
                  ))}
                  {d.rows.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-[12.5px] text-subtle">{t("empty")}</td></tr> : null}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="py-8 text-center text-[13px] text-subtle">…</p>}
      </div>
    </div>
  );
}
