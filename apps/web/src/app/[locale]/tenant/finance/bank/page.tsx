"use client";

import { useCallback, useEffect, useState } from "react";
import { Landmark, Plus, Upload, Link2, X, ArrowLeft, CheckCircle2, Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Account { id: string; name: string; bankName: string | null; currency: string; openingBalance: number; balance: number; txnCount: number; unmatched: number }
interface Txn { id: string; txnDate: string; description: string; amount: number; reference: string | null; status: string; matchedVoucherId: string | null; matchedVoucher: { sequenceNo: string | null; type: string } | null }
interface VoucherCand { id: string; sequenceNo: string | null; type: string; signedAmount: number; createdAt: string }
interface Recon {
  account: { id: string; name: string; currency: string; openingBalance: number };
  bankBalance: number; bookMatchedBalance: number; difference: number;
  totals: { lines: number; matched: number; unmatched: number; ignored: number; matchedAmount: number; unmatchedAmount: number };
  reconciled: boolean; unmatchedTransactions: Txn[]; unmatchedVouchers: VoucherCand[];
}

const stTone: Record<string, BadgeTone> = { matched: "success", unmatched: "warning", ignored: "neutral" };

export default function BankReconciliationPage() {
  const t = useTranslations("bank");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sel, setSel] = useState<string>("");
  const [txns, setTxns] = useState<Txn[]>([]);
  const [recon, setRecon] = useState<Recon | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const loadAccounts = useCallback(() => { void api<Account[]>("/finance/bank/accounts").then((a) => { setAccounts(a); if (!sel && a.length) setSel(a[0].id); }).catch(() => setAccounts([])); }, [sel]);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const loadAccount = useCallback((id: string) => {
    void api<Txn[]>(`/finance/bank/accounts/${id}/transactions`).then(setTxns).catch(() => setTxns([]));
    void api<Recon>(`/finance/bank/accounts/${id}/reconciliation`).then(setRecon).catch(() => setRecon(null));
  }, []);
  useEffect(() => { if (sel) loadAccount(sel); }, [sel, loadAccount]);

  const refresh = () => { loadAccounts(); if (sel) loadAccount(sel); };
  async function match(txnId: string, voucherId: string) { await api(`/finance/bank/transactions/${txnId}/match`, { method: "POST", body: JSON.stringify({ voucherId }) }); refresh(); }
  async function setStatus(txnId: string, status: string) { await api(`/finance/bank/transactions/${txnId}/status`, { method: "PUT", body: JSON.stringify({ status }) }); refresh(); }

  const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = (d: string) => new Date(d).toLocaleDateString("en-GB");

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={
        <Link href="/tenant/finance" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 text-[13px] font-medium text-muted hover:bg-surface-2"><ArrowLeft size={15} className="rtl:rotate-180" /> {t("backToFinance")}</Link>
      } />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        {/* الحسابات */}
        <aside className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-ink">{t("accounts")}</h2>
            <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-primary hover:bg-surface-2"><Plus size={13} /> {t("add")}</button>
          </div>
          {accounts.map((a) => (
            <button key={a.id} onClick={() => setSel(a.id)} className={`w-full rounded-card border p-3 text-start ${sel === a.id ? "border-primary bg-primary-soft/30" : "border-line bg-card hover:bg-surface-2/60"}`}>
              <div className="flex items-center gap-2 text-[13px] font-semibold text-ink"><Landmark size={14} className="text-primary" /> {a.name}</div>
              <div className="mt-1 flex items-center justify-between text-[11.5px]">
                <span className="text-subtle">{a.bankName ?? "—"}</span>
                <span className="tnum font-medium text-ink">{m(a.balance)} <span className="text-[10px] text-subtle">{a.currency}</span></span>
              </div>
              {a.unmatched > 0 ? <div className="mt-1"><Badge tone="warning">{t("unmatchedN", { n: a.unmatched })}</Badge></div> : null}
            </button>
          ))}
          {accounts.length === 0 ? <p className="rounded-card border border-line bg-card p-4 text-center text-[12.5px] text-subtle">{t("noAccounts")}</p> : null}
        </aside>

        {/* التسوية */}
        <section className="space-y-4">
          {recon ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-line bg-card p-3.5"><p className="text-[11px] text-subtle">{t("bankBalance")}</p><p className="mt-1 text-[16px] font-bold text-ink tnum">{m(recon.bankBalance)}</p></div>
                <div className="rounded-xl border border-line bg-card p-3.5"><p className="text-[11px] text-subtle">{t("matched")}</p><p className="mt-1 text-[16px] font-bold text-success tnum">{recon.totals.matched}</p></div>
                <div className="rounded-xl border border-line bg-card p-3.5"><p className="text-[11px] text-subtle">{t("unmatched")}</p><p className="mt-1 text-[16px] font-bold text-warning tnum">{recon.totals.unmatched}</p></div>
                <div className={`rounded-xl border-2 p-3.5 ${recon.reconciled ? "border-success/40 bg-success-soft/30" : "border-warning/40 bg-warning-soft/30"}`}><p className="text-[11px] text-subtle">{t("status")}</p><p className="mt-1"><Badge tone={recon.reconciled ? "success" : "warning"}>{recon.reconciled ? t("reconciled") : t("pending")}</Badge></p></div>
              </div>

              <div className="flex justify-end">
                <button onClick={() => setShowImport(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary"><Upload size={15} /> {t("import")}</button>
              </div>

              <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
                <div className="border-b border-line px-5 py-3 text-[14px] font-semibold text-ink">{t("statement")}</div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px]">
                    <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                      <th className="px-4 py-3 text-start font-semibold">{t("col.date")}</th>
                      <th className="px-4 py-3 text-start font-semibold">{t("col.desc")}</th>
                      <th className="px-4 py-3 text-end font-semibold">{t("col.amount")}</th>
                      <th className="px-4 py-3 text-center font-semibold">{t("col.status")}</th>
                      <th className="px-4 py-3 text-end font-semibold">{t("col.match")}</th>
                    </tr></thead>
                    <tbody className="divide-y divide-line">
                      {txns.map((tx) => (
                        <tr key={tx.id} className="text-[12.5px] hover:bg-surface-2/60">
                          <td className="px-4 py-2.5 text-subtle tnum">{date(tx.txnDate)}</td>
                          <td className="px-4 py-2.5 text-ink">{tx.description}{tx.reference ? <span className="text-[10.5px] text-subtle"> · {tx.reference}</span> : null}</td>
                          <td className={`px-4 py-2.5 text-end tnum font-medium ${tx.amount < 0 ? "text-danger" : "text-success"}`}>{tx.amount < 0 ? "−" : ""}{m(Math.abs(tx.amount))}</td>
                          <td className="px-4 py-2.5 text-center"><Badge tone={stTone[tx.status] ?? "neutral"}>{t(`st.${tx.status}`)}{tx.matchedVoucher ? ` · ${tx.matchedVoucher.sequenceNo}` : ""}</Badge></td>
                          <td className="px-4 py-2.5 text-end">
                            {tx.status === "unmatched" ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <select defaultValue="" onChange={(e) => e.target.value && match(tx.id, e.target.value)} className="h-8 rounded-lg border border-line bg-card px-2 text-[11.5px] text-ink">
                                  <option value="">{t("matchWith")}</option>
                                  {recon.unmatchedVouchers.filter((v) => Math.abs(v.signedAmount - tx.amount) < 0.01).map((v) => <option key={v.id} value={v.id}>{v.sequenceNo} ({v.type})</option>)}
                                  {recon.unmatchedVouchers.filter((v) => Math.abs(v.signedAmount - tx.amount) >= 0.01).map((v) => <option key={v.id} value={v.id}>{v.sequenceNo} ({v.type}) · {m(v.signedAmount)}</option>)}
                                </select>
                                <button onClick={() => setStatus(tx.id, "ignored")} title={t("ignore")} className="text-subtle hover:text-danger"><Ban size={14} /></button>
                              </div>
                            ) : tx.status === "matched" ? (
                              <button onClick={() => setStatus(tx.id, "unmatched")} className="inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-ink"><Link2 size={12} /> {t("unlink")}</button>
                            ) : (
                              <button onClick={() => setStatus(tx.id, "unmatched")} className="text-[11.5px] text-muted hover:text-ink">{t("restore")}</button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {txns.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-[12.5px] text-subtle">{t("noTxns")}</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <p className="rounded-card border border-line bg-card p-8 text-center text-[13px] text-subtle">{accounts.length ? t("selectAccount") : t("noAccounts")}</p>
          )}
        </section>
      </div>

      {showAdd ? <AddAccount onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); loadAccounts(); }} /> : null}
      {showImport && sel ? <ImportModal accountId={sel} onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); refresh(); }} /> : null}
    </div>
  );
}

function AddAccount({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useTranslations("bank");
  const [v, setV] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));
  const field = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  async function save() {
    setErr(""); setSaving(true);
    try { await api("/finance/bank/accounts", { method: "POST", body: JSON.stringify({ name: v.name?.trim(), bankName: v.bankName?.trim() || undefined, iban: v.iban?.trim() || undefined, accountNo: v.accountNo?.trim() || undefined, openingBalance: v.openingBalance ? Number(v.openingBalance) : undefined }) }); onDone(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("addTitle")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("f.name")}</span><input value={v.name ?? ""} onChange={set("name")} className={field} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("f.bank")}</span><input value={v.bankName ?? ""} onChange={set("bankName")} className={field} /></label>
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("f.opening")}</span><input type="number" value={v.openingBalance ?? ""} onChange={set("openingBalance")} className={field} /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("f.iban")}</span><input value={v.iban ?? ""} onChange={set("iban")} className={field} /></label>
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("f.accountNo")}</span><input value={v.accountNo ?? ""} onChange={set("accountNo")} className={field} /></label>
          </div>
          {err ? <p className="text-[12px] font-medium text-danger">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("cancel")}</button>
            <button onClick={save} disabled={saving || !v.name || v.name.trim().length < 2} className="h-9 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">{saving ? "…" : t("save")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ accountId, onClose, onDone }: { accountId: string; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("bank");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  async function run() {
    setErr(""); setSaving(true);
    try {
      // كل سطر: تاريخ,وصف,مبلغ,مرجع(اختياري) — المبلغ موجب إيداع/سالب سحب
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
        const [txnDate, description, amount, reference] = l.split(",").map((x) => x.trim());
        return { txnDate, description: description ?? "", amount: Number(amount), reference: reference || undefined };
      }).filter((l) => l.txnDate && Number.isFinite(l.amount));
      if (lines.length === 0) { setErr(t("importEmpty")); setSaving(false); return; }
      await api(`/finance/bank/accounts/${accountId}/import`, { method: "POST", body: JSON.stringify({ lines }) });
      onDone();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("importTitle")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <p className="mb-2 text-[12px] text-subtle">{t("importHint")}</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} dir="ltr" placeholder={"2026-07-01,Deposit RCV,15000\n2026-07-03,Bank fee,-25"} className="w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-[12px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
        {err ? <p className="mt-2 text-[12px] font-medium text-danger">{err}</p> : null}
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("cancel")}</button>
          <button onClick={run} disabled={saving || !text.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><CheckCircle2 size={15} /> {saving ? "…" : t("doImport")}</button>
        </div>
      </div>
    </div>
  );
}
