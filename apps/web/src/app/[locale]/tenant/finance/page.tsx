"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Landmark, Wallet2, ShieldCheck, FileText, QrCode, Building2, Scale, Banknote, X, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { usePaged, Pagination } from "@/components/ui/Pagination";

type FinanceTab = "coa" | "invoices" | "payables" | "trial";

interface Summary { grossPremium: number; netPremium: number; vat: number; commission: number; serviceFees: number; offBalanceTrust: number; receivables: number; collected: number; invoiceCount: number; voucherCount: number }
interface Coa { id: string; code: string; name: string; level: number; isOnBalance: boolean; isLocked: boolean; accountType: string | null }
interface Invoice { id: string; sequenceNo: string | null; kind: string; party: string; insurerName: string | null; netAmount: string | null; vatAmount: string | null; totalAmount: string | null; status: string | null; zatca: { qr: string; uuid: string; hash: string } }
interface PayRow { insurer: string; payable: number; settled: number; outstanding: number; count: number }
interface Payables { rows: PayRow[]; summary: { payable: number; settled: number; outstanding: number } }
interface TrialRow { account: string; name: string; debit: number; credit: number; balance: number }
interface Trial { rows: TrialRow[]; totals: { debit: number; credit: number; balanced: boolean } }

export default function FinancePage() {
  const t = useTranslations();
  const [s, setS] = useState<Summary | null>(null);
  const [coa, setCoa] = useState<Coa[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pay, setPay] = useState<Payables | null>(null);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [settle, setSettle] = useState<PayRow | null>(null);
  const [done, setDone] = useState("");
  const [open, setOpen] = useState("");
  const [tab, setTab] = useState<FinanceTab>("coa");

  const load = useCallback(() => {
    void api<Summary>("/finance/summary").then(setS).catch(() => undefined);
    void api<Coa[]>("/finance/coa").then(setCoa).catch(() => undefined);
    void api<Invoice[]>("/finance/invoices").then(setInvoices).catch(() => undefined);
    void api<Payables>("/finance/payables").then(setPay).catch(() => undefined);
    void api<Trial>("/finance/trial-balance").then(setTrial).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);

  // ترقيم صفحات (50/صفحة) لكل جدول — يظهر الشريط تلقائيًا عند تجاوز البيانات الحدّ
  const coaPage = usePaged(coa);
  const invPage = usePaged(invoices);
  const payPage = usePaged(pay?.rows ?? []);
  const trialPage = usePaged(trial?.rows ?? []);

  const fmt = (n: string | number | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

  const TABS: Array<{ key: FinanceTab; icon: typeof Landmark; label: string; count: number }> = [
    { key: "coa", icon: Landmark, label: t("finance.tab.coa"), count: coa.length },
    { key: "invoices", icon: QrCode, label: t("finance.tab.invoices"), count: invoices.length },
    { key: "payables", icon: Building2, label: t("finance.tab.payables"), count: pay?.rows.length ?? 0 },
    { key: "trial", icon: Scale, label: t("finance.tab.trial"), count: trial?.rows.length ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("finance.title")} subtitle={t("finance.subtitle")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="primary" icon={<Landmark size={18} />} title={t("finance.grossPremium")} value={<span className="tnum">{s ? fmt(s.grossPremium) : "…"}</span>} sub={t("common.sar")} />
        <StatCard tone="success" icon={<Wallet2 size={18} />} title={t("finance.commission")} value={<span className="tnum">{s ? fmt(s.commission) : "…"}</span>} sub={t("common.sar")} />
        <StatCard tone="info" icon={<ShieldCheck size={18} />} title={t("finance.offBalance")} value={<span className="tnum">{s ? fmt(s.offBalanceTrust) : "…"}</span>} sub={t("finance.offBalanceSub")} />
        <StatCard tone="warning" icon={<FileText size={18} />} title={t("finance.receivables")} value={<span className="tnum">{s ? fmt(s.receivables) : "…"}</span>} sub={t("common.sar")} />
      </div>

      {/* شريط التبويبات للتنقّل بين بلوكات المالية */}
      <div className="flex flex-wrap gap-1.5 rounded-card border border-line bg-card p-1.5 shadow-card">
        {TABS.map((tb) => {
          const Icon = tb.icon;
          const active = tab === tb.key;
          return (
            <button key={tb.key} type="button" onClick={() => setTab(tb.key)}
              className={`inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors ${active ? "bg-primary-strong text-primary-fg shadow-sm" : "text-muted hover:bg-surface-2 hover:text-ink"}`}>
              <Icon size={16} />
              <span>{tb.label}</span>
              <span className={`hidden rounded-full px-1.5 py-0.5 text-[10.5px] tnum sm:inline ${active ? "bg-white/20 text-primary-fg" : "bg-surface-2 text-subtle"}`}>{tb.count}</span>
            </button>
          );
        })}
      </div>

      {done ? <p className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{done}</p> : null}

      {/* شجرة الحسابات */}
      {tab === "coa" ? (
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">{t("finance.coa")}</h2>
          <p className="text-[12px] text-subtle">{t("finance.coaSub")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("finance.col.code")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("finance.col.account")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("finance.col.type")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("finance.col.balance")}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {coaPage.pageItems.map((a) => (
                <tr key={a.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-2.5 text-[12px] font-medium text-ink tnum">{a.code}</td>
                  <td className="px-5 py-2.5 text-[13px] text-ink">{a.name} {a.isLocked ? <span className="text-[10px] text-subtle">🔒</span> : null}</td>
                  <td className="px-5 py-2.5 text-[12px] text-muted">{a.accountType ?? "—"}</td>
                  <td className="px-5 py-2.5"><Badge tone={a.isOnBalance ? "info" : "warning"}>{a.isOnBalance ? t("finance.onBalance") : t("finance.offBalanceTag")}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={coaPage.page} pageCount={coaPage.pageCount} total={coaPage.total} from={coaPage.from} to={coaPage.to} onPage={coaPage.setPage} />
      </section>
      ) : null}

      {/* الفواتير الضريبية + ZATCA */}
      {tab === "invoices" ? (
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <QrCode size={17} className="text-success" />
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold text-ink">{t("finance.invoices")}</h2>
            <p className="text-[12px] text-subtle">{t("finance.invoicesSub")}</p>
          </div>
          {s && s.serviceFees > 0 ? (
            <Badge tone="warning">{t("finance.serviceFees")}: <span className="tnum">{fmt(s.serviceFees)}</span> {t("common.sar")}</Badge>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("finance.col.invoiceNo")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("finance.col.invoiceKind")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("finance.col.party")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("finance.col.net")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("finance.col.vat")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("finance.col.total")}</th>
              <th className="px-5 py-3 text-start font-semibold">ZATCA</th>
              <th className="px-5 py-3"></th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {invPage.pageItems.map((inv) => (
                <Fragment key={inv.id}>
                  <tr className="hover:bg-surface-2/60">
                    <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{inv.sequenceNo ?? "—"}</td>
                    <td className="px-5 py-3"><Badge tone={inv.kind === "FEES" ? "warning" : "info"}>{inv.kind === "FEES" ? t("finance.invoiceFees") : t("finance.invoiceCommission")}</Badge></td>
                    <td className="px-5 py-3 text-[13px] text-muted">{inv.party ?? inv.insurerName ?? "—"}</td>
                    <td className="px-5 py-3 text-end text-[13px] text-muted tnum">{fmt(inv.netAmount)}</td>
                    <td className="px-5 py-3 text-end text-[13px] text-muted tnum">{fmt(inv.vatAmount)}</td>
                    <td className="px-5 py-3 text-end text-[13px] font-medium text-ink tnum">{fmt(inv.totalAmount)} <span className="text-[11px] text-subtle">{t("common.sar")}</span></td>
                    <td className="px-5 py-3"><Badge tone="success"><ShieldCheck size={12} /> {t("finance.zatcaOk")}</Badge></td>
                    <td className="px-5 py-3 text-end">
                      <button onClick={() => setOpen(open === inv.id ? "" : inv.id)} className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2 hover:text-ink">{t("finance.zatcaShow")}</button>
                    </td>
                  </tr>
                  {open === inv.id ? (
                    <tr className="bg-surface-2/40">
                      <td colSpan={8} className="px-5 py-3">
                        <div className="space-y-1.5 text-[11.5px]">
                          <div className="flex gap-2"><span className="w-20 text-subtle">UUID</span><span className="tnum text-ink">{inv.zatca.uuid}</span></div>
                          <div className="flex gap-2"><span className="w-20 text-subtle">{t("finance.zatcaHash")}</span><span className="tnum break-all text-ink">{inv.zatca.hash}</span></div>
                          <div className="flex gap-2"><span className="w-20 shrink-0 text-subtle">QR (TLV)</span><span className="tnum break-all text-muted">{inv.zatca.qr}</span></div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={invPage.page} pageCount={invPage.pageCount} total={invPage.total} from={invPage.from} to={invPage.to} onPage={invPage.setPage} />
      </section>
      ) : null}

      {/* المستحقّ للمؤمِّنين (أمانات) + التسوية */}
      {tab === "payables" ? (
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <Building2 size={17} className="text-info" />
          <div><h2 className="text-[15px] font-semibold text-ink">{t("finance.payables")}</h2><p className="text-[12px] text-subtle">{t("finance.payablesSub")}</p></div>
          {pay ? <span className="ms-auto text-[12px] text-subtle">{t("finance.pcol.outstanding")}: <span className="font-bold text-warning tnum">{fmt(pay.summary.outstanding)}</span> {t("common.sar")}</span> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("finance.pcol.insurer")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("finance.pcol.payable")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("finance.pcol.settled")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("finance.pcol.outstanding")}</th>
              <th className="px-5 py-3 text-end font-semibold" />
            </tr></thead>
            <tbody className="divide-y divide-line">
              {payPage.pageItems.map((r) => (
                <tr key={r.insurer} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[13px] font-medium text-ink">{r.insurer} <span className="text-[11px] text-subtle">({r.count})</span></td>
                  <td className="px-5 py-3 text-end text-[13px] text-ink tnum">{fmt(r.payable)}</td>
                  <td className="px-5 py-3 text-end text-[13px] text-success tnum">{r.settled ? fmt(r.settled) : "—"}</td>
                  <td className={`px-5 py-3 text-end text-[13px] tnum ${r.outstanding > 0 ? "font-medium text-warning" : "text-subtle"}`}>{fmt(r.outstanding)}</td>
                  <td className="px-5 py-3 text-end">{r.outstanding > 0 ? <button onClick={() => { setDone(""); setSettle(r); }} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2"><Banknote size={13} /> {t("finance.settle")}</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={payPage.page} pageCount={payPage.pageCount} total={payPage.total} from={payPage.from} to={payPage.to} onPage={payPage.setPage} />
      </section>
      ) : null}

      {/* ميزان المراجعة */}
      {tab === "trial" ? (
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <Scale size={17} className="text-primary" />
          <div><h2 className="text-[15px] font-semibold text-ink">{t("finance.trialBalance")}</h2><p className="text-[12px] text-subtle">{t("finance.trialBalanceSub")}</p></div>
          {trial ? <Badge tone={trial.totals.balanced ? "success" : "danger"}>{trial.totals.balanced ? t("finance.balanced") : t("finance.notBalanced")}</Badge> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("finance.tcol.account")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("finance.tcol.debit")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("finance.tcol.credit")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("finance.tcol.balance")}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {trialPage.pageItems.map((r) => (
                <tr key={r.account} className="hover:bg-surface-2/60">
                  <td className="px-5 py-2.5 text-[12.5px] text-ink">{r.name} <span className="text-[11px] text-subtle tnum">{r.account.slice(0, 4)}</span></td>
                  <td className="px-5 py-2.5 text-end text-[12.5px] text-ink tnum">{r.debit ? fmt(r.debit) : "—"}</td>
                  <td className="px-5 py-2.5 text-end text-[12.5px] text-ink tnum">{r.credit ? fmt(r.credit) : "—"}</td>
                  <td className={`px-5 py-2.5 text-end text-[12.5px] tnum ${r.balance < 0 ? "text-danger" : "text-ink"}`}>{fmt(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            {trial ? (
              <tfoot><tr className="border-t-2 border-line bg-surface-2/40 text-[13px] font-bold text-ink">
                <td className="px-5 py-3">{t("premiums.totalRow")}</td>
                <td className="px-5 py-3 text-end tnum">{fmt(trial.totals.debit)}</td>
                <td className="px-5 py-3 text-end tnum">{fmt(trial.totals.credit)}</td>
                <td className="px-5 py-3 text-end tnum">{fmt(trial.totals.debit - trial.totals.credit)}</td>
              </tr></tfoot>
            ) : null}
          </table>
        </div>
        <Pagination page={trialPage.page} pageCount={trialPage.pageCount} total={trialPage.total} from={trialPage.from} to={trialPage.to} onPage={trialPage.setPage} />
      </section>
      ) : null}

      {settle ? <SettleInsurer row={settle} onClose={() => setSettle(null)} onDone={(seq) => { setSettle(null); setDone(t("finance.settleModal.done", { seq })); load(); }} /> : null}
    </div>
  );
}

function SettleInsurer({ row, onClose, onDone }: { row: PayRow; onClose: () => void; onDone: (seq: string) => void }) {
  const t = useTranslations("finance.settleModal");
  const [amount, setAmount] = useState(String(row.outstanding));
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const field = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";

  async function save() {
    setErr(""); setSaving(true);
    try {
      const r = await api<{ voucher: { sequenceNo: string } }>("/finance/insurers/settle", { method: "POST", body: JSON.stringify({ insurerName: row.insurer, amount: Number(amount), reference: reference || undefined }) });
      onDone(r.voucher.sequenceNo);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("title")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <p className="mb-3 text-[12px] text-subtle">{row.insurer} · <span className="tnum text-warning">{row.outstanding.toLocaleString("en-US")}</span></p>
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
