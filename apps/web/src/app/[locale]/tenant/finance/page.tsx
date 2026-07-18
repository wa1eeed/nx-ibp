"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Landmark, Wallet2, ShieldCheck, FileText, QrCode, Building2, Scale, Banknote, X, Check, Printer, LineChart, Users, Percent, Coins, AlertTriangle, BookText, Plus, Trash2, Receipt } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { usePaged, Pagination } from "@/components/ui/Pagination";

type FinanceTab = "overview" | "journal" | "commissions" | "receivables" | "coa" | "invoices" | "payables" | "trial" | "balance" | "cashflow" | "vat";

interface Summary { grossPremium: number; netPremium: number; vat: number; commission: number; serviceFees: number; offBalanceTrust: number; receivables: number; collected: number; invoiceCount: number; voucherCount: number }
interface Overview {
  incomeStatement: { commissionIncome: number; serviceFees: number; totalRevenue: number; subBrokerCommission: number; netIncome: number; netMargin: number };
  health: { gwp: number; policyCount: number; effectiveCommissionRate: number; avgIncomePerPolicy: number; commissionCollectedPct: number; commissionReceived: number; commissionOutstanding: number; receivables: number; trustToRemit: number; lossRatio: number; settledClaims: number };
  trend: Array<{ month: string; revenue: number; expense: number; net: number }>;
}
interface Coa { id: string; code: string; name: string; level: number; isOnBalance: boolean; isLocked: boolean; accountType: string | null }
interface Invoice { id: string; sequenceNo: string | null; kind: string; party: string; insurerName: string | null; netAmount: string | null; vatAmount: string | null; totalAmount: string | null; status: string | null; zatca: { qr: string; uuid: string; hash: string } }
interface PayRow { insurer: string; payable: number; settled: number; outstanding: number; count: number }
interface Payables { rows: PayRow[]; summary: { payable: number; settled: number; outstanding: number } }
interface TrialRow { account: string; name: string; debit: number; credit: number; balance: number }
interface Trial { rows: TrialRow[]; totals: { debit: number; credit: number; balanced: boolean } }
interface PostAccount { code: string; name: string; accountType: string | null; isOnBalance: boolean }
interface JournalEntry { account: string; name: string; debit: number; credit: number }
interface JournalVoucher { id: string; sequenceNo: string | null; amount: string | null; reference: string | null; createdAt: string; lines: { description?: string; date?: string; entries?: JournalEntry[] } | null }
interface EmpCommRow { userId: string; name: string; commissionRate: number | null; policies: number; accrued: number; eligible: number; paid: number; outstanding: number }
interface EmpComm { rows: EmpCommRow[]; summary: { employees: number; accrued: number; eligible: number; paid: number; outstanding: number } }
interface ProducerRow { id: string; name: string; code: string | null; policies: number; commissionOwed: number; paid: number; outstanding: number; status: string | null }
interface Producers { rows: ProducerRow[]; summary: { producers: number; commissionOwed: number; paid: number; outstanding: number } }
interface RecvNote { id: string; sequenceNo: string | null; clientName: string; total: number; settled: number; outstanding: number; status: string; hasPlan: boolean; ageDays: number | null }
interface Aging { current: number; d3160: number; d6190: number; d90plus: number; overdue: number; total: number }
interface AgingClient { clientId: string; clientName: string; current: number; d3160: number; d6190: number; d90plus: number; total: number }
interface Receivables { outstanding: number; collected: number; notes: RecvNote[]; aging: Aging; agingByClient: AgingClient[] }
interface InstallmentRow { id: string; seq: number; dueDate: string; amount: number; settled: number; outstanding: number; status: string }
interface BalanceLine { code: string; name: string; amount: number; isOnBalance: boolean }
interface BalanceSheet { asOf: string; assets: BalanceLine[]; liabilities: BalanceLine[]; equity: BalanceLine[]; retainedEarnings: number; unclassified: Array<{ code: string; name: string; amount: number }>; totals: { assets: number; liabilities: number; equity: number; liabilitiesAndEquity: number; offBalance: number; balanced: boolean } }
interface LedgerRow { voucherId: string; sequenceNo: string | null; type: string; date: string; description: string; reference: string | null; debit: number; credit: number; balance: number }
interface Ledger { account: string; name: string; accountType: string | null; isOnBalance: boolean; rows: LedgerRow[]; totals: { debit: number; credit: number; balance: number } }
interface VatReturn { from: string | null; to: string | null; standardRate: number; taxableStandard: number; outputVat: number; inputVat: number; netVat: number; refund: boolean }
interface CashFlowLine { code: string; name: string; amount: number }
interface CashFlowActivity { lines: CashFlowLine[]; net: number }
interface CashFlow { from: string | null; to: string | null; opening: number; operating: CashFlowActivity; investing: CashFlowActivity; financing: CashFlowActivity; netChange: number; closing: number; reconciles: boolean }

export default function FinancePage() {
  const t = useTranslations();
  const [s, setS] = useState<Summary | null>(null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [coa, setCoa] = useState<Coa[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pay, setPay] = useState<Payables | null>(null);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [postAccts, setPostAccts] = useState<PostAccount[]>([]);
  const [journal, setJournal] = useState<JournalVoucher[]>([]);
  const [empComm, setEmpComm] = useState<EmpComm | null>(null);
  const [producers, setProducers] = useState<Producers | null>(null);
  const [recv, setRecv] = useState<Receivables | null>(null);
  const [planFor, setPlanFor] = useState<RecvNote | null>(null);
  const [bsheet, setBsheet] = useState<BalanceSheet | null>(null);
  const [ledgerFor, setLedgerFor] = useState<{ code: string; name: string } | null>(null);
  const [settleComm, setSettleComm] = useState<{ kind: "employee" | "producer"; id: string; name: string; outstanding: number } | null>(null);
  const [settle, setSettle] = useState<PayRow | null>(null);
  const [done, setDone] = useState("");
  const [open, setOpen] = useState("");
  const [tab, setTab] = useState<FinanceTab>("overview");

  const load = useCallback(() => {
    void api<Summary>("/finance/summary").then(setS).catch(() => undefined);
    void api<Overview>("/finance/overview").then(setOv).catch(() => undefined);
    void api<Coa[]>("/finance/coa").then(setCoa).catch(() => undefined);
    void api<Invoice[]>("/finance/invoices").then(setInvoices).catch(() => undefined);
    void api<Payables>("/finance/payables").then(setPay).catch(() => undefined);
    void api<Trial>("/finance/trial-balance").then(setTrial).catch(() => undefined);
    void api<PostAccount[]>("/finance/posting-accounts").then(setPostAccts).catch(() => undefined);
    void api<JournalVoucher[]>("/finance/journal").then(setJournal).catch(() => undefined);
    void api<EmpComm>("/finance/employee-commissions").then(setEmpComm).catch(() => undefined);
    void api<Producers>("/producers").then(setProducers).catch(() => undefined);
    void api<Receivables>("/finance/receivables").then(setRecv).catch(() => undefined);
    void api<BalanceSheet>("/finance/balance-sheet").then(setBsheet).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);

  // ترقيم صفحات (50/صفحة) لكل جدول — يظهر الشريط تلقائيًا عند تجاوز البيانات الحدّ
  const coaPage = usePaged(coa);
  const invPage = usePaged(invoices);
  const payPage = usePaged(pay?.rows ?? []);
  const trialPage = usePaged(trial?.rows ?? []);

  const fmt = (n: string | number | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

  const TABS: Array<{ key: FinanceTab; icon: typeof Landmark; label: string; count: number | null }> = [
    { key: "overview", icon: LineChart, label: t("finance.tab.overview"), count: null },
    { key: "journal", icon: BookText, label: t("finance.tab.journal"), count: journal.length },
    { key: "commissions", icon: Coins, label: t("finance.tab.commissions"), count: (empComm?.rows.length ?? 0) + (producers?.rows.length ?? 0) },
    { key: "receivables", icon: Receipt, label: t("finance.tab.receivables"), count: recv?.notes.length ?? 0 },
    { key: "coa", icon: Landmark, label: t("finance.tab.coa"), count: coa.length },
    { key: "invoices", icon: QrCode, label: t("finance.tab.invoices"), count: invoices.length },
    { key: "payables", icon: Building2, label: t("finance.tab.payables"), count: pay?.rows.length ?? 0 },
    { key: "trial", icon: Scale, label: t("finance.tab.trial"), count: trial?.rows.length ?? 0 },
    { key: "balance", icon: Scale, label: t("finance.tab.balance"), count: null },
    { key: "cashflow", icon: Banknote, label: t("finance.tab.cashflow"), count: null },
    { key: "vat", icon: Percent, label: t("finance.tab.vat"), count: null },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("finance.title")} subtitle={t("finance.subtitle")} actions={
        <Link href="/tenant/finance/bank" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 text-[13px] font-medium text-primary hover:bg-surface-2"><Landmark size={15} /> {t("finance.bankRecon")}</Link>
      } />

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
              {tb.count != null ? <span className={`hidden rounded-full px-1.5 py-0.5 text-[10.5px] tnum sm:inline ${active ? "bg-white/20 text-primary-fg" : "bg-surface-2 text-subtle"}`}>{tb.count}</span> : null}
            </button>
          );
        })}
      </div>

      {done ? <p className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{done}</p> : null}

      {/* نظرة المالك: قائمة الدخل + صحة الأعمال + اتجاه 6 أشهر */}
      {tab === "overview" ? (
        !ov ? (
          <div className="rounded-card border border-line bg-card p-8 text-center text-[13px] text-muted shadow-card">…</div>
        ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* قائمة الدخل المبسّطة */}
          <section className="overflow-hidden rounded-card border border-line bg-card shadow-card lg:col-span-1">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="text-[15px] font-semibold text-ink">{t("finance.overview.incomeStatement")}</h2>
              <p className="text-[12px] text-subtle">{t("finance.overview.incomeStatementSub")}</p>
            </div>
            <div className="divide-y divide-line px-5 text-[13px]">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted">{t("finance.overview.commissionIncome")}</span>
                <span className="tnum font-semibold text-ink">{fmt(ov.incomeStatement.commissionIncome)}</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted">{t("finance.overview.serviceFees")}</span>
                <span className="tnum font-semibold text-ink">{fmt(ov.incomeStatement.serviceFees)}</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="font-medium text-ink">{t("finance.overview.totalRevenue")}</span>
                <span className="tnum font-bold text-ink">{fmt(ov.incomeStatement.totalRevenue)}</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted">− {t("finance.overview.subBrokerCommission")}</span>
                <span className="tnum font-semibold text-danger">{fmt(ov.incomeStatement.subBrokerCommission)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between bg-primary/5 px-5 py-3.5">
              <div>
                <div className="text-[13px] font-semibold text-primary">{t("finance.overview.netIncome")}</div>
                <div className="text-[11px] text-subtle">{t("finance.overview.netMargin")}: <span className="tnum">{ov.incomeStatement.netMargin}%</span></div>
              </div>
              <span className="tnum text-[20px] font-extrabold text-ink">{fmt(ov.incomeStatement.netIncome)}</span>
            </div>
            <p className="border-t border-line px-5 py-2 text-[10.5px] leading-relaxed text-subtle">{t("finance.overview.vatNote")}</p>
          </section>

          {/* صحة الأعمال + الاتجاه */}
          <div className="space-y-5 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: <Landmark size={15} />, label: t("finance.overview.gwp"), value: fmt(ov.health.gwp), sub: t("finance.overview.gwpSub") },
                { icon: <Users size={15} />, label: t("finance.overview.policyCount"), value: ov.health.policyCount.toLocaleString("en-US"), sub: t("finance.overview.avgIncome", { v: fmt(ov.health.avgIncomePerPolicy) }) },
                { icon: <Percent size={15} />, label: t("finance.overview.effectiveRate"), value: `${ov.health.effectiveCommissionRate}%`, sub: t("finance.overview.effectiveRateSub") },
                { icon: <Coins size={15} />, label: t("finance.overview.commissionCollected"), value: `${ov.health.commissionCollectedPct}%`, sub: t("finance.overview.outstanding", { v: fmt(ov.health.commissionOutstanding) }) },
              ].map((k, i) => (
                <div key={i} className="rounded-card border border-line bg-card p-3.5 shadow-card">
                  <div className="mb-1 flex items-center gap-1.5 text-subtle">{k.icon}<span className="text-[11px] font-medium">{k.label}</span></div>
                  <div className="tnum text-[19px] font-bold text-ink">{k.value}</div>
                  <div className="text-[10.5px] text-subtle">{k.sub}</div>
                </div>
              ))}
            </div>

            {/* مؤشّرات إضافية: الذمم · الأمانات · نسبة الخسارة */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-card border border-line bg-card p-3.5 shadow-card">
                <div className="mb-1 flex items-center gap-1.5 text-warning"><FileText size={15} /><span className="text-[11px] font-medium text-subtle">{t("finance.overview.receivables")}</span></div>
                <div className="tnum text-[17px] font-bold text-ink">{fmt(ov.health.receivables)}</div>
                <div className="text-[10.5px] text-subtle">{t("finance.overview.receivablesSub")}</div>
              </div>
              <div className="rounded-card border border-line bg-card p-3.5 shadow-card">
                <div className="mb-1 flex items-center gap-1.5 text-info"><ShieldCheck size={15} /><span className="text-[11px] font-medium text-subtle">{t("finance.overview.trust")}</span></div>
                <div className="tnum text-[17px] font-bold text-ink">{fmt(ov.health.trustToRemit)}</div>
                <div className="text-[10.5px] text-subtle">{t("finance.overview.trustSub")}</div>
              </div>
              <div className="rounded-card border border-line bg-card p-3.5 shadow-card">
                <div className="mb-1 flex items-center gap-1.5 text-subtle">
                  {ov.health.lossRatio > 70 ? <AlertTriangle size={15} className="text-danger" /> : <ShieldCheck size={15} className="text-success" />}
                  <span className="text-[11px] font-medium">{t("finance.overview.lossRatio")}</span>
                </div>
                <div className={`tnum text-[17px] font-bold ${ov.health.lossRatio > 70 ? "text-danger" : "text-ink"}`}>{ov.health.lossRatio}%</div>
                <div className="text-[10.5px] text-subtle">{t("finance.overview.lossRatioSub")}</div>
              </div>
            </div>

            {/* اتجاه صافي الدخل — آخر 6 أشهر */}
            <section className="rounded-card border border-line bg-card p-4 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink"><LineChart size={15} className="text-primary" /> {t("finance.overview.trend")}</h3>
                <div className="flex items-center gap-3 text-[10.5px] text-subtle">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary/25" /> {t("finance.overview.revenue")}</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" /> {t("finance.overview.net")}</span>
                </div>
              </div>
              {(() => {
                const maxV = Math.max(...ov.trend.map((m) => m.revenue), 1);
                return (
                  <div className="flex items-end justify-between gap-2" style={{ height: 132 }}>
                    {ov.trend.map((m) => {
                      const [, mm] = m.month.split("-");
                      return (
                        <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5" title={`${m.month} · ${t("finance.overview.net")}: ${fmt(m.net)} · ${t("finance.overview.revenue")}: ${fmt(m.revenue)}`}>
                          <div className="tnum text-[10px] font-semibold text-ink">{fmt(m.net)}</div>
                          <div className="relative flex w-full max-w-[38px] flex-1 items-end justify-center">
                            <div className="w-full rounded-t bg-primary/20" style={{ height: `${(m.revenue / maxV) * 100}%` }} />
                            <div className="absolute bottom-0 w-[60%] rounded-t bg-primary" style={{ height: `${(Math.max(m.net, 0) / maxV) * 100}%` }} />
                          </div>
                          <div className="tnum text-[10.5px] text-subtle">{+mm}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </section>
          </div>
        </div>
        )
      ) : null}

      {/* القيود اليدوية والمصروفات */}
      {tab === "journal" ? (
        <JournalTab accounts={postAccts} vouchers={journal} onPosted={() => { setDone(t("finance.journal.posted")); load(); }} />
      ) : null}

      {/* العمولات: موظفون + وسطاء فرعيون */}
      {tab === "commissions" ? (
        <CommissionsTab emp={empComm} producers={producers} onSettle={(kind, id, name, outstanding) => { setDone(""); setSettleComm({ kind, id, name, outstanding }); }} />
      ) : null}

      {/* الذمم المدينة وخطط التقسيط */}
      {tab === "receivables" ? (
        <ReceivablesTab data={recv} onPlan={(n) => { setDone(""); setPlanFor(n); }} />
      ) : null}
      {planFor ? <InstallmentPlanModal note={planFor} onClose={() => setPlanFor(null)} onDone={() => { setPlanFor(null); setDone(t("finance.installments.created")); load(); }} /> : null}

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
                      <div className="inline-flex items-center gap-1.5">
                        <Link href={`/tenant/documents/invoice/${inv.id}`} title={t("finance.printDoc")} className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2 hover:text-ink"><Printer size={13} /> {t("finance.printDoc")}</Link>
                        <button onClick={() => setOpen(open === inv.id ? "" : inv.id)} className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2 hover:text-ink">{t("finance.zatcaShow")}</button>
                      </div>
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
                <tr key={r.account} onClick={() => setLedgerFor({ code: r.account, name: r.name })} className="cursor-pointer hover:bg-surface-2/60" title={t("finance.ledger.open")}>
                  <td className="px-5 py-2.5 text-[12.5px] font-medium text-primary underline decoration-dotted underline-offset-2">{r.name} <span className="text-[11px] text-subtle tnum">{r.account.slice(0, 4)}</span></td>
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
        <p className="border-t border-line px-5 py-2 text-[10.5px] text-subtle">{t("finance.ledger.hint")}</p>
      </section>
      ) : null}

      {/* الميزانية العمومية (بيان المركز المالي) */}
      {tab === "balance" ? <BalanceSheetTab data={bsheet} onLedger={(code, name) => setLedgerFor({ code, name })} /> : null}

      {/* إقرار ضريبة القيمة المضافة */}
      {tab === "cashflow" ? <CashFlowTab /> : null}

      {tab === "vat" ? <VatReturnTab /> : null}

      {ledgerFor ? <LedgerModal account={ledgerFor} onClose={() => setLedgerFor(null)} /> : null}
      {settle ? <SettleInsurer row={settle} onClose={() => setSettle(null)} onDone={(seq) => { setSettle(null); setDone(t("finance.settleModal.done", { seq })); load(); }} /> : null}
      {settleComm ? <SettleCommission item={settleComm} onClose={() => setSettleComm(null)} onDone={() => { setSettleComm(null); setDone(t("finance.commissions.settled")); load(); }} /> : null}
    </div>
  );
}

/** تبويب العمولات: دفتر عمولات الموظفين (استحقاق عند التحصيل) + الوسطاء الفرعيين، مع صرف. */
function CommissionsTab({ emp, producers, onSettle }: { emp: EmpComm | null; producers: Producers | null; onSettle: (kind: "employee" | "producer", id: string, name: string, outstanding: number) => void }) {
  const t = useTranslations();
  const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="space-y-5">
      {/* الموظفون */}
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3.5">
          <Users size={17} className="text-primary" />
          <div><h2 className="text-[15px] font-semibold text-ink">{t("finance.commissions.employees")}</h2><p className="text-[12px] text-subtle">{t("finance.commissions.employeesSub")}</p></div>
          {emp ? <span className="ms-auto text-[12px] text-subtle">{t("finance.commissions.outstanding")}: <span className="font-bold text-warning tnum">{m(emp.summary.outstanding)}</span> {t("common.sar")}</span> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("finance.commissions.employee")}</th>
              <th className="px-4 py-3 text-end font-semibold">{t("finance.commissions.rate")}</th>
              <th className="px-4 py-3 text-end font-semibold">{t("finance.commissions.accrued")}</th>
              <th className="px-4 py-3 text-end font-semibold">{t("finance.commissions.eligible")}</th>
              <th className="px-4 py-3 text-end font-semibold">{t("finance.commissions.paid")}</th>
              <th className="px-4 py-3 text-end font-semibold">{t("finance.commissions.outstandingCol")}</th>
              <th className="px-4 py-3"></th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {emp?.rows.map((r) => (
                <tr key={r.userId} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[13px] font-medium text-ink">{r.name} <span className="text-[11px] text-subtle">({r.policies})</span></td>
                  <td className="px-4 py-3 text-end text-[12.5px] text-muted tnum">{r.commissionRate != null ? `${r.commissionRate}%` : "—"}</td>
                  <td className="px-4 py-3 text-end text-[12.5px] text-subtle tnum" title={t("finance.commissions.accruedHint")}>{m(r.accrued)}</td>
                  <td className="px-4 py-3 text-end text-[12.5px] font-medium text-ink tnum" title={t("finance.commissions.eligibleHint")}>{m(r.eligible)}</td>
                  <td className="px-4 py-3 text-end text-[12.5px] text-success tnum">{r.paid ? m(r.paid) : "—"}</td>
                  <td className={`px-4 py-3 text-end text-[12.5px] tnum ${r.outstanding > 0 ? "font-semibold text-warning" : "text-subtle"}`}>{m(r.outstanding)}</td>
                  <td className="px-4 py-3 text-end">{r.outstanding > 0 ? <button onClick={() => onSettle("employee", r.userId, r.name, r.outstanding)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2"><Banknote size={13} /> {t("finance.commissions.settle")}</button> : null}</td>
                </tr>
              ))}
              {emp && emp.rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-8 text-center text-[12.5px] text-subtle">{t("finance.commissions.emptyEmp")}</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-2 text-[10.5px] leading-relaxed text-subtle">{t("finance.commissions.note")}</p>
      </section>

      {/* الوسطاء الفرعيون */}
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3.5">
          <Building2 size={17} className="text-info" />
          <div><h2 className="text-[15px] font-semibold text-ink">{t("finance.commissions.producers")}</h2><p className="text-[12px] text-subtle">{t("finance.commissions.producersSub")}</p></div>
          {producers ? <span className="ms-auto text-[12px] text-subtle">{t("finance.commissions.outstanding")}: <span className="font-bold text-warning tnum">{m(producers.summary.outstanding)}</span> {t("common.sar")}</span> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("finance.commissions.producer")}</th>
              <th className="px-4 py-3 text-end font-semibold">{t("finance.commissions.owed")}</th>
              <th className="px-4 py-3 text-end font-semibold">{t("finance.commissions.paid")}</th>
              <th className="px-4 py-3 text-end font-semibold">{t("finance.commissions.outstandingCol")}</th>
              <th className="px-4 py-3"></th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {producers?.rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[13px] font-medium text-ink">{r.name} <span className="text-[11px] text-subtle">({r.policies})</span></td>
                  <td className="px-4 py-3 text-end text-[12.5px] font-medium text-ink tnum">{m(r.commissionOwed)}</td>
                  <td className="px-4 py-3 text-end text-[12.5px] text-success tnum">{r.paid ? m(r.paid) : "—"}</td>
                  <td className={`px-4 py-3 text-end text-[12.5px] tnum ${r.outstanding > 0 ? "font-semibold text-warning" : "text-subtle"}`}>{m(r.outstanding)}</td>
                  <td className="px-4 py-3 text-end">{r.outstanding > 0 ? <button onClick={() => onSettle("producer", r.id, r.name, r.outstanding)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2"><Banknote size={13} /> {t("finance.commissions.settle")}</button> : null}</td>
                </tr>
              ))}
              {producers && producers.rows.length === 0 ? <tr><td colSpan={5} className="px-5 py-8 text-center text-[12.5px] text-subtle">{t("finance.commissions.emptyProd")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** لون شارة حالة القسط/الإشعار المدين. */
function instTone(status: string): string {
  switch (status) {
    case "paid": return "bg-success-soft text-success";
    case "partial": return "bg-info-soft text-info";
    case "overdue": return "bg-danger-soft text-danger";
    case "outstanding": return "bg-warning-soft text-warning";
    default: return "bg-surface-2 text-subtle"; // due
  }
}

/** الذمم المدينة (إشعارات مدينة) + إدارة خطط التقسيط لكل إشعار. */
function ReceivablesTab({ data, onPlan }: { data: Receivables | null; onPlan: (n: RecvNote) => void }) {
  const t = useTranslations();
  const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sched, setSched] = useState<Record<string, InstallmentRow[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const notes = data?.notes ?? [];
  const page = usePaged(notes);

  const loadSched = useCallback(async (id: string) => {
    setBusy(id);
    try { const rows = await api<InstallmentRow[]>(`/finance/debit-notes/${id}/installments`); setSched((s) => ({ ...s, [id]: rows })); }
    catch { setSched((s) => ({ ...s, [id]: [] })); }
    finally { setBusy(null); }
  }, []);
  async function toggle(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!sched[id]) await loadSched(id);
  }

  const ag = data?.aging;
  const bucket = (label: string, value: number, tone: string) => (
    <div className={`rounded-xl border p-3.5 ${tone}`}>
      <p className="text-[11px] font-medium opacity-80">{label}</p>
      <p className="mt-1 text-[16px] font-bold tnum">{m(value)}</p>
    </div>
  );
  return (
    <div className="space-y-4">
      {ag ? (
        <div className="rounded-card border border-line bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2"><AlertTriangle size={15} className="text-warning" /><h3 className="text-[13.5px] font-semibold text-ink">{t("finance.aging.title")}</h3><span className="text-[11px] text-subtle">{t("finance.aging.sub")}</span>{ag.overdue > 0 ? <span className="ms-auto text-[12px] text-subtle">{t("finance.aging.overdue")}: <span className="font-bold text-danger tnum">{m(ag.overdue)}</span></span> : null}</div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {bucket(t("finance.aging.current"), ag.current, "border-success/30 bg-success-soft/40 text-success")}
            {bucket(t("finance.aging.d3160"), ag.d3160, "border-warning/30 bg-warning-soft/40 text-warning")}
            {bucket(t("finance.aging.d6190"), ag.d6190, "border-warning/40 bg-warning-soft/60 text-warning")}
            {bucket(t("finance.aging.d90plus"), ag.d90plus, "border-danger/30 bg-danger-soft/40 text-danger")}
          </div>
        </div>
      ) : null}
    <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3.5">
        <Receipt size={17} className="text-warning" />
        <div><h2 className="text-[15px] font-semibold text-ink">{t("finance.receivables")}</h2><p className="text-[12px] text-subtle">{t("finance.receivablesSub")}</p></div>
        {data ? <span className="ms-auto text-[12px] text-subtle">{t("finance.receivablesTab.outstanding")}: <span className="font-bold text-warning tnum">{m(data.outstanding)}</span> {t("common.sar")}</span> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
            <th className="px-5 py-3 text-start font-semibold">{t("finance.receivablesTab.note")}</th>
            <th className="px-4 py-3 text-start font-semibold">{t("finance.receivablesTab.client")}</th>
            <th className="px-4 py-3 text-end font-semibold">{t("finance.receivablesTab.total")}</th>
            <th className="px-4 py-3 text-end font-semibold">{t("finance.receivablesTab.settled")}</th>
            <th className="px-4 py-3 text-end font-semibold">{t("finance.receivablesTab.outstandingCol")}</th>
            <th className="px-4 py-3 text-center font-semibold">{t("finance.aging.age")}</th>
            <th className="px-4 py-3 text-center font-semibold">{t("finance.receivablesTab.status")}</th>
            <th className="px-4 py-3"></th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {page.pageItems.map((n) => (
              <Fragment key={n.id}>
                <tr className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{n.sequenceNo ?? n.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-[13px] text-ink">{n.clientName}</td>
                  <td className="px-4 py-3 text-end text-[12.5px] font-medium text-ink tnum">{m(n.total)}</td>
                  <td className="px-4 py-3 text-end text-[12.5px] text-success tnum">{n.settled ? m(n.settled) : "—"}</td>
                  <td className={`px-4 py-3 text-end text-[12.5px] tnum ${n.outstanding > 0 ? "font-semibold text-warning" : "text-subtle"}`}>{m(n.outstanding)}</td>
                  <td className="px-4 py-3 text-center text-[12px] tnum">{n.ageDays == null ? "—" : <span className={n.ageDays > 90 ? "font-semibold text-danger" : n.ageDays > 30 ? "text-warning" : "text-subtle"}>{t("finance.aging.days", { n: n.ageDays })}</span>}</td>
                  <td className="px-4 py-3 text-center"><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${instTone(n.status)}`}>{t(`finance.receivablesTab.st.${n.status}`)}</span></td>
                  <td className="px-4 py-3 text-end">
                    <div className="flex items-center justify-end gap-1.5">
                      {n.outstanding > 0 && !n.hasPlan ? <button onClick={() => onPlan(n)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2"><Coins size={13} /> {t("finance.installments.plan")}</button> : null}
                      {n.hasPlan ? <button onClick={() => toggle(n.id)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2">{expanded === n.id ? t("finance.installments.hide") : t("finance.installments.schedule")}</button> : null}
                    </div>
                  </td>
                </tr>
                {expanded === n.id ? (
                  <tr className="bg-surface-2/40"><td colSpan={8} className="px-5 py-3">
                    {busy === n.id && !sched[n.id] ? <p className="py-3 text-center text-[12px] text-subtle">…</p> : (sched[n.id]?.length ?? 0) === 0 ? (
                      <p className="py-3 text-center text-[12px] text-subtle">{t("finance.installments.none")}{n.outstanding > 0 ? <> — <button onClick={() => onPlan(n)} className="font-semibold text-primary hover:underline">{t("finance.installments.createNow")}</button></> : null}</p>
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-line bg-card">
                        <table className="w-full">
                          <thead><tr className="border-b border-line text-[10.5px] uppercase tracking-wide text-subtle">
                            <th className="px-4 py-2 text-start font-semibold">{t("finance.installments.seq")}</th>
                            <th className="px-4 py-2 text-start font-semibold">{t("finance.installments.due")}</th>
                            <th className="px-4 py-2 text-end font-semibold">{t("finance.installments.amount")}</th>
                            <th className="px-4 py-2 text-end font-semibold">{t("finance.installments.settledCol")}</th>
                            <th className="px-4 py-2 text-center font-semibold">{t("finance.receivablesTab.status")}</th>
                          </tr></thead>
                          <tbody className="divide-y divide-line">
                            {sched[n.id]?.map((r) => (
                              <tr key={r.id}>
                                <td className="px-4 py-2 text-[12px] font-medium text-ink tnum">{r.seq}</td>
                                <td className="px-4 py-2 text-[12px] text-muted tnum">{r.dueDate.slice(0, 10)}</td>
                                <td className="px-4 py-2 text-end text-[12px] text-ink tnum">{m(r.amount)}</td>
                                <td className="px-4 py-2 text-end text-[12px] text-success tnum">{r.settled ? m(r.settled) : "—"}</td>
                                <td className="px-4 py-2 text-center"><span className={`inline-block rounded-full px-2 py-0.5 text-[10.5px] font-medium ${instTone(r.status)}`}>{t(`finance.receivablesTab.st.${r.status}`)}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </td></tr>
                ) : null}
              </Fragment>
            ))}
            {data && notes.length === 0 ? <tr><td colSpan={8} className="px-5 py-8 text-center text-[12.5px] text-subtle">{t("finance.receivablesTab.empty")}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pagination page={page.page} pageCount={page.pageCount} total={page.total} from={page.from} to={page.to} onPage={page.setPage} />
      <p className="border-t border-line px-5 py-2 text-[10.5px] leading-relaxed text-subtle">{t("finance.installments.note")}</p>
    </section>

    <RefundsSection />
    </div>
  );
}

/** المرتجعات: الإشعارات الدائنة على العملاء (CNP) — صرف المرتجع فعليًا + طباعة سند الصرف (§1.7). */
function RefundsSection() {
  const t = useTranslations("finance.refunds");
  const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  interface CreditNote { id: string; sequenceNo: string | null; clientName: string | null; total: number; refundedAt: string | null; refundVoucherId: string | null; createdAt: string }
  const [rows, setRows] = useState<CreditNote[]>([]);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => { void api<CreditNote[]>("/finance/credit-notes").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  async function refund(id: string) {
    setBusy(id);
    try { await api(`/finance/credit-notes/${id}/refund`, { method: "POST", body: JSON.stringify({ method: "transfer" }) }); load(); }
    finally { setBusy(""); }
  }
  if (rows.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
      <div className="border-b border-line px-5 py-3 text-[14px] font-semibold text-ink">{t("title")}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
            <th className="px-5 py-3 text-start font-semibold">{t("no")}</th>
            <th className="px-4 py-3 text-start font-semibold">{t("client")}</th>
            <th className="px-4 py-3 text-end font-semibold">{t("amount")}</th>
            <th className="px-4 py-3 text-center font-semibold">{t("status")}</th>
            <th className="px-4 py-3 text-end font-semibold"></th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2/60">
                <td className="px-5 py-3 text-[12.5px] font-medium tnum text-ink">{r.sequenceNo ?? "—"}</td>
                <td className="px-4 py-3 text-[12.5px] text-muted">{r.clientName ?? "—"}</td>
                <td className="px-4 py-3 text-end text-[13px] font-medium tnum text-ink">{m(r.total)}</td>
                <td className="px-4 py-3 text-center">{r.refundedAt ? <Badge tone="success">{t("refunded")}</Badge> : <Badge tone="warning">{t("pending")}</Badge>}</td>
                <td className="px-4 py-3 text-end">
                  {r.refundedAt && r.refundVoucherId ? (
                    <Link href={`/tenant/documents/voucher/${r.refundVoucherId}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"><Printer size={12} /> {t("printVoucher")}</Link>
                  ) : (
                    <button onClick={() => refund(r.id)} disabled={!!busy} className="h-8 rounded-lg bg-primary-strong px-3 text-[12px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">{busy === r.id ? "…" : t("payRefund")}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** إنشاء خطة تقسيط لإشعار مدين — عدد دفعات + تاريخ أول قسط. */
function InstallmentPlanModal({ note, onClose, onDone }: { note: RecvNote; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("finance.installments");
  const [count, setCount] = useState("3");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const field = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  const n = Number(count);
  const per = n >= 2 && note.total > 0 ? note.total / n : 0;
  async function save() {
    setErr(""); setSaving(true);
    try {
      await api(`/finance/debit-notes/${note.id}/installments`, { method: "POST", body: JSON.stringify({ count: n, firstDueDate: firstDueDate || undefined }) });
      onDone();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("planTitle")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <p className="mb-3 text-[12px] text-subtle">{note.clientName} · {t("total")}: <span className="tnum text-ink">{note.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("count")}</span><input type="number" min={2} max={36} value={count} onChange={(e) => setCount(e.target.value)} className={`${field} tnum`} /></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("firstDue")}</span><input type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} className={`${field} tnum`} /><span className="mt-1 block text-[10.5px] text-subtle">{t("firstDueHint")}</span></label>
          {per > 0 ? <p className="rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-muted">{t("preview", { count: n, per: per.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</p> : null}
          {err ? <p className="text-[12px] font-medium text-danger">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("cancel")}</button>
            <button onClick={save} disabled={saving || !(n >= 2 && n <= 36)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><Check size={15} /> {saving ? "…" : t("confirm")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** صرف عمولة (موظف أو وسيط فرعي) — سند PYV. */
function SettleCommission({ item, onClose, onDone }: { item: { kind: "employee" | "producer"; id: string; name: string; outstanding: number }; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("finance.commissions");
  const [amount, setAmount] = useState(String(item.outstanding));
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const field = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  async function save() {
    setErr(""); setSaving(true);
    try {
      const url = item.kind === "employee" ? `/finance/employee-commissions/${item.id}/settle` : `/producers/${item.id}/settle`;
      await api(url, { method: "POST", body: JSON.stringify({ amount: Number(amount), reference: reference || undefined }) });
      onDone();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("settleTitle")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <p className="mb-3 text-[12px] text-subtle">{item.name} · {t("outstanding")}: <span className="tnum text-warning">{item.outstanding.toLocaleString("en-US")}</span></p>
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("amount")}</span><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} tnum`} /></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("reference")}</span><input value={reference} onChange={(e) => setReference(e.target.value)} className={field} /></label>
          {err ? <p className="text-[12px] font-medium text-danger">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("cancel")}</button>
            <button onClick={save} disabled={saving || !(Number(amount) > 0)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><Check size={15} /> {saving ? "…" : t("settleConfirm")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** الميزانية العمومية (بيان المركز المالي) — أصول = خصوم + حقوق ملكية + صافي الدخل. */
function BalanceSheetTab({ data, onLedger }: { data: BalanceSheet | null; onLedger: (code: string, name: string) => void }) {
  const t = useTranslations();
  const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!data) return <div className="rounded-card border border-line bg-card p-8 text-center text-[13px] text-muted shadow-card">…</div>;
  const Side = ({ title, lines, total, extra }: { title: string; lines: BalanceLine[]; total: number; extra?: { label: string; amount: number } }) => (
    <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
      <div className="border-b border-line bg-surface-2/40 px-5 py-3"><h3 className="text-[14px] font-bold text-ink">{title}</h3></div>
      <div className="divide-y divide-line">
        {lines.map((l) => (
          <button key={l.code} type="button" onClick={() => onLedger(l.code, l.name)} className="flex w-full items-center justify-between px-5 py-2.5 text-start hover:bg-surface-2/60">
            <span className="text-[12.5px] text-ink">{l.name}{!l.isOnBalance ? <span className="ms-2 rounded-full bg-info-soft px-1.5 py-0.5 text-[10px] text-info">{t("finance.balanceSheet.offBalance")}</span> : null}</span>
            <span className="text-[12.5px] font-medium text-ink tnum">{m(l.amount)}</span>
          </button>
        ))}
        {extra ? (
          <div className="flex items-center justify-between px-5 py-2.5">
            <span className="text-[12.5px] italic text-muted">{extra.label}</span>
            <span className="text-[12.5px] font-medium text-ink tnum">{m(extra.amount)}</span>
          </div>
        ) : null}
        {lines.length === 0 && !extra ? <p className="px-5 py-6 text-center text-[12px] text-subtle">{t("finance.balanceSheet.empty")}</p> : null}
      </div>
      <div className="flex items-center justify-between border-t-2 border-line bg-surface-2/40 px-5 py-3"><span className="text-[13px] font-bold text-ink">{t("finance.balanceSheet.total")}</span><span className="text-[13px] font-bold text-ink tnum">{m(total)}</span></div>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-card px-5 py-3 shadow-card">
        <Scale size={17} className="text-primary" />
        <div><h2 className="text-[15px] font-semibold text-ink">{t("finance.balanceSheet.title")}</h2><p className="text-[12px] text-subtle">{t("finance.balanceSheet.sub")} · {t("finance.balanceSheet.asOf")} {data.asOf}</p></div>
        <span className="ms-auto"><Badge tone={data.totals.balanced ? "success" : "danger"}>{data.totals.balanced ? t("finance.balanceSheet.balanced") : t("finance.balanceSheet.notBalanced")}</Badge></span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Side title={t("finance.balanceSheet.assets")} lines={data.assets} total={data.totals.assets} />
        <div className="space-y-4">
          <Side title={t("finance.balanceSheet.liabilities")} lines={data.liabilities} total={data.totals.liabilities} />
          <Side title={t("finance.balanceSheet.equity")} lines={data.equity} total={data.totals.equity} extra={{ label: t("finance.balanceSheet.retainedEarnings"), amount: data.retainedEarnings }} />
          <div className="flex items-center justify-between rounded-card border-2 border-primary/30 bg-primary-soft/40 px-5 py-3"><span className="text-[13px] font-bold text-ink">{t("finance.balanceSheet.totalLiabEquity")}</span><span className="text-[13px] font-bold text-ink tnum">{m(data.totals.liabilitiesAndEquity)}</span></div>
        </div>
      </div>
      {data.totals.offBalance > 0 ? <p className="rounded-lg bg-info-soft px-4 py-2.5 text-[11.5px] text-info">{t("finance.balanceSheet.offBalanceNote", { amount: m(data.totals.offBalance) })}</p> : null}
      {data.unclassified.length > 0 ? <p className="rounded-lg bg-warning-soft px-4 py-2.5 text-[11.5px] text-warning">{t("finance.balanceSheet.unclassified", { count: data.unclassified.length })}</p> : null}
    </div>
  );
}

/** دفتر الأستاذ — كشف حركة حساب برصيد جارٍ (drill-down من ميزان المراجعة/الميزانية). */
function LedgerModal({ account, onClose }: { account: { code: string; name: string }; onClose: () => void }) {
  const t = useTranslations();
  const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [data, setData] = useState<Ledger | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { void api<Ledger>(`/finance/ledger/${account.code}`).then(setData).catch(() => setErr(true)); }, [account.code]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-card border border-line bg-card shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div><h2 className="text-[15px] font-bold text-ink">{t("finance.ledger.title")}</h2><p className="text-[12px] text-subtle">{account.name} <span className="tnum">{account.code}</span></p></div>
          <button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button>
        </div>
        <div className="overflow-auto">
          {err ? <p className="px-5 py-8 text-center text-[13px] text-danger">{t("finance.ledger.error")}</p> : !data ? <p className="px-5 py-8 text-center text-[13px] text-subtle">…</p> : data.rows.length === 0 ? <p className="px-5 py-8 text-center text-[13px] text-subtle">{t("finance.ledger.empty")}</p> : (
            <table className="w-full min-w-[640px]">
              <thead className="sticky top-0 bg-card"><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-4 py-2.5 text-start font-semibold">{t("finance.ledger.date")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("finance.ledger.voucher")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("finance.ledger.desc")}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t("finance.tcol.debit")}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t("finance.tcol.credit")}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t("finance.tcol.balance")}</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((r, i) => (
                  <tr key={`${r.voucherId}-${i}`} className="hover:bg-surface-2/60">
                    <td className="px-4 py-2 text-[12px] text-muted tnum">{r.date}</td>
                    <td className="px-4 py-2 text-[12px] font-medium text-ink tnum">{r.sequenceNo ?? r.type}</td>
                    <td className="px-4 py-2 text-[12px] text-muted">{r.description}</td>
                    <td className="px-4 py-2 text-end text-[12px] text-ink tnum">{r.debit ? m(r.debit) : "—"}</td>
                    <td className="px-4 py-2 text-end text-[12px] text-ink tnum">{r.credit ? m(r.credit) : "—"}</td>
                    <td className={`px-4 py-2 text-end text-[12px] font-medium tnum ${r.balance < 0 ? "text-danger" : "text-ink"}`}>{m(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
              {data ? <tfoot><tr className="border-t-2 border-line bg-surface-2/40 text-[12.5px] font-bold text-ink"><td colSpan={3} className="px-4 py-2.5">{t("premiums.totalRow")}</td><td className="px-4 py-2.5 text-end tnum">{m(data.totals.debit)}</td><td className="px-4 py-2.5 text-end tnum">{m(data.totals.credit)}</td><td className="px-4 py-2.5 text-end tnum">{m(data.totals.balance)}</td></tr></tfoot> : null}
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/** إقرار ضريبة القيمة المضافة — المخرجات − المدخلات = صافي المستحق للهيئة، عن فترة اختيارية. */
function VatReturnTab() {
  const t = useTranslations();
  const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<VatReturn | null>(null);
  const [loading, setLoading] = useState(false);
  const run = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const q = qs.toString();
    void api<VatReturn>(`/finance/vat-return${q ? `?${q}` : ""}`).then(setData).catch(() => undefined).finally(() => setLoading(false));
  }, [from, to]);
  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const field = "h-9 rounded-lg border border-line bg-card px-3 text-[13px] text-ink tnum focus:outline-none focus:ring-2 focus:ring-primary/30";
  return (
    <div className="space-y-4">
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2"><Percent size={17} className="text-primary" /><div><h2 className="text-[15px] font-semibold text-ink">{t("finance.vat.title")}</h2><p className="text-[12px] text-subtle">{t("finance.vat.sub")}</p></div></div>
          <div className="ms-auto flex items-end gap-2">
            <label className="block"><span className="mb-1 block text-[11px] font-medium text-muted">{t("finance.vat.from")}</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} /></label>
            <label className="block"><span className="mb-1 block text-[11px] font-medium text-muted">{t("finance.vat.to")}</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} /></label>
            <button onClick={run} disabled={loading} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">{loading ? "…" : t("finance.vat.run")}</button>
          </div>
        </div>
        {!data ? <p className="py-8 text-center text-[13px] text-subtle">…</p> : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-line bg-surface-2/40 p-4"><p className="text-[11.5px] text-subtle">{t("finance.vat.taxableStandard")}</p><p className="mt-1 text-[18px] font-bold text-ink tnum">{m(data.taxableStandard)}</p><p className="text-[10.5px] text-subtle">{t("finance.vat.stdRate", { rate: data.standardRate })}</p></div>
              <div className="rounded-xl border border-line bg-surface-2/40 p-4"><p className="text-[11.5px] text-subtle">{t("finance.vat.output")}</p><p className="mt-1 text-[18px] font-bold text-ink tnum">{m(data.outputVat)}</p><p className="text-[10.5px] text-subtle">{t("finance.vat.outputSub")}</p></div>
              <div className="rounded-xl border border-line bg-surface-2/40 p-4"><p className="text-[11.5px] text-subtle">{t("finance.vat.input")}</p><p className="mt-1 text-[18px] font-bold text-ink tnum">{m(data.inputVat)}</p><p className="text-[10.5px] text-subtle">{t("finance.vat.inputSub")}</p></div>
              <div className={`rounded-xl border-2 p-4 ${data.refund ? "border-info/40 bg-info-soft/40" : "border-primary/30 bg-primary-soft/40"}`}><p className="text-[11.5px] text-subtle">{data.refund ? t("finance.vat.refund") : t("finance.vat.net")}</p><p className={`mt-1 text-[18px] font-bold tnum ${data.refund ? "text-info" : "text-ink"}`}>{m(Math.abs(data.netVat))}</p><p className="text-[10.5px] text-subtle">{t("finance.vat.netSub")}</p></div>
            </div>
            <p className="mt-4 rounded-lg bg-surface-2 px-4 py-2.5 text-[11px] leading-relaxed text-subtle">{t("finance.vat.note")}</p>
          </>
        )}
      </section>
    </div>
  );
}

/** بيان التدفّق النقدي (الطريقة المباشرة): افتتاحي + تشغيلي/استثماري/تمويلي ⇒ ختامي. */
function CashFlowTab() {
  const t = useTranslations();
  const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (n: number) => `${n < 0 ? "−" : ""}${m(Math.abs(n))}`;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<CashFlow | null>(null);
  const [loading, setLoading] = useState(false);
  const run = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const q = qs.toString();
    void api<CashFlow>(`/finance/cash-flow${q ? `?${q}` : ""}`).then(setData).catch(() => undefined).finally(() => setLoading(false));
  }, [from, to]);
  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const field = "h-9 rounded-lg border border-line bg-card px-3 text-[13px] text-ink tnum focus:outline-none focus:ring-2 focus:ring-primary/30";

  const Activity = ({ title, sub, act }: { title: string; sub: string; act: CashFlowActivity }) => (
    <div className="rounded-xl border border-line bg-surface-2/30">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div><h3 className="text-[13.5px] font-semibold text-ink">{title}</h3><p className="text-[11px] text-subtle">{sub}</p></div>
        <span className={`text-[15px] font-bold tnum ${act.net < 0 ? "text-danger" : "text-success"}`}>{signed(act.net)}</span>
      </div>
      {act.lines.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-subtle">{t("finance.cashflow.none")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {act.lines.map((l) => (
            <li key={l.code} className="flex items-center justify-between px-4 py-2 text-[12.5px]">
              <span className="text-ink">{l.name} <span className="text-subtle tnum">({l.code.replace(/0+$/, "") || l.code})</span></span>
              <span className={`tnum font-medium ${l.amount < 0 ? "text-danger" : "text-success"}`}>{signed(l.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2"><Banknote size={17} className="text-primary" /><div><h2 className="text-[15px] font-semibold text-ink">{t("finance.cashflow.title")}</h2><p className="text-[12px] text-subtle">{t("finance.cashflow.sub")}</p></div></div>
          <div className="ms-auto flex items-end gap-2">
            <label className="block"><span className="mb-1 block text-[11px] font-medium text-muted">{t("finance.cashflow.from")}</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} /></label>
            <label className="block"><span className="mb-1 block text-[11px] font-medium text-muted">{t("finance.cashflow.to")}</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} /></label>
            <button onClick={run} disabled={loading} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">{loading ? "…" : t("finance.cashflow.run")}</button>
          </div>
        </div>
        {!data ? <p className="py-8 text-center text-[13px] text-subtle">…</p> : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-line bg-surface-2/40 p-4"><p className="text-[11.5px] text-subtle">{t("finance.cashflow.opening")}</p><p className="mt-1 text-[18px] font-bold text-ink tnum">{m(data.opening)}</p></div>
              <div className="rounded-xl border border-line bg-surface-2/40 p-4"><p className="text-[11.5px] text-subtle">{t("finance.cashflow.netChange")}</p><p className={`mt-1 text-[18px] font-bold tnum ${data.netChange < 0 ? "text-danger" : "text-success"}`}>{signed(data.netChange)}</p></div>
              <div className="rounded-xl border-2 border-primary/30 bg-primary-soft/40 p-4"><p className="text-[11.5px] text-subtle">{t("finance.cashflow.closing")}</p><p className="mt-1 text-[18px] font-bold text-ink tnum">{m(data.closing)}</p></div>
              <div className="rounded-xl border border-line bg-surface-2/40 p-4"><p className="text-[11.5px] text-subtle">{t("finance.cashflow.reconcile")}</p><p className="mt-1"><Badge tone={data.reconciles ? "success" : "danger"}>{data.reconciles ? t("finance.cashflow.reconciled") : t("finance.cashflow.unreconciled")}</Badge></p></div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <Activity title={t("finance.cashflow.operating")} sub={t("finance.cashflow.operatingSub")} act={data.operating} />
              <Activity title={t("finance.cashflow.investing")} sub={t("finance.cashflow.investingSub")} act={data.investing} />
              <Activity title={t("finance.cashflow.financing")} sub={t("finance.cashflow.financingSub")} act={data.financing} />
            </div>
            <p className="mt-4 rounded-lg bg-surface-2 px-4 py-2.5 text-[11px] leading-relaxed text-subtle">{t("finance.cashflow.note")}</p>
          </>
        )}
      </section>
    </div>
  );
}

type JLine = { account: string; debit: string; credit: string };
const CASH_CODE = "01010000000000000";
const ACCT_GROUPS = ["asset", "liability", "equity", "revenue", "expense"] as const;

/** القيود اليدوية والمصروفات: مُنشئ قيد متوازن (مدين=دائن) + قوالب سريعة + سجلّ القيود. */
function JournalTab({ accounts, vouchers, onPosted }: { accounts: PostAccount[]; vouchers: JournalVoucher[]; onPosted: () => void }) {
  const t = useTranslations();
  const blank = (): JLine => ({ account: "", debit: "", credit: "" });
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<JLine[]>([blank(), blank()]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [openV, setOpenV] = useState("");

  const n = (v: string) => Number(v) || 0;
  const totD = lines.reduce((s, l) => s + n(l.debit), 0);
  const totC = lines.reduce((s, l) => s + n(l.credit), 0);
  const diff = Math.round((totD - totC) * 100) / 100;
  const balanced = Math.abs(diff) < 0.01 && totD > 0;
  const money = (x: number | string | null) => (x == null ? "—" : Number(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  const setLine = (i: number, patch: Partial<JLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, blank()]);
  const removeLine = (i: number) => setLines((ls) => (ls.length > 2 ? ls.filter((_, j) => j !== i) : ls));
  const expenseTemplate = () => { setLines([blank(), { account: CASH_CODE, debit: "", credit: "" }]); setErr(""); };
  const clearForm = () => { setDesc(""); setDate(""); setReference(""); setLines([blank(), blank()]); setErr(""); };
  const byType = (ty: string) => accounts.filter((a) => a.accountType === ty);

  async function post() {
    setErr(""); setSaving(true);
    try {
      const entries = lines.filter((l) => l.account && (n(l.debit) > 0 || n(l.credit) > 0)).map((l) => ({ account: l.account, debit: n(l.debit) || undefined, credit: n(l.credit) || undefined }));
      await api("/finance/journal", { method: "POST", body: JSON.stringify({ description: desc, date: date || undefined, reference: reference || undefined, entries }) });
      clearForm(); onPosted();
    } catch (e) { setErr(e instanceof ApiError ? (e.details?.[0] ?? e.message) : "خطأ"); } finally { setSaving(false); }
  }

  const sel = "h-9 w-full rounded-lg border border-line bg-card px-2 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  const inp = "h-9 w-full rounded-lg border border-line bg-card px-2 text-end text-[12.5px] tnum text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      {/* المُنشئ */}
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card lg:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
          <div><h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><BookText size={17} className="text-primary" /> {t("finance.journal.title")}</h2><p className="text-[12px] text-subtle">{t("finance.journal.sub")}</p></div>
          <div className="flex items-center gap-1.5">
            <button onClick={expenseTemplate} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-medium text-muted hover:bg-surface-2"><Receipt size={13} /> {t("finance.journal.expenseTemplate")}</button>
            <button onClick={clearForm} className="rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-medium text-muted hover:bg-surface-2">{t("finance.journal.clear")}</button>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="block sm:col-span-2"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("finance.journal.description")}</span><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("finance.journal.descPlaceholder")} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" /></label>
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("finance.journal.date")}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={sel} /></label>
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("finance.journal.reference")}</span><input value={reference} onChange={(e) => setReference(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" /></label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead><tr className="text-[10.5px] uppercase tracking-wide text-subtle"><th className="pb-1 text-start font-semibold">{t("finance.journal.account")}</th><th className="pb-1 text-end font-semibold">{t("finance.journal.debit")}</th><th className="pb-1 text-end font-semibold">{t("finance.journal.credit")}</th><th /></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-1 pe-2">
                      <select value={l.account} onChange={(e) => setLine(i, { account: e.target.value })} className={sel}>
                        <option value="">{t("finance.journal.pickAccount")}</option>
                        {ACCT_GROUPS.map((g) => byType(g).length ? (
                          <optgroup key={g} label={t(`finance.acctType.${g}`)}>
                            {byType(g).map((a) => <option key={a.code} value={a.code}>{a.code.slice(0, 4)} · {a.name}</option>)}
                          </optgroup>
                        ) : null)}
                      </select>
                    </td>
                    <td className="py-1 pe-1 w-[110px]"><input type="number" min="0" step="0.01" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: "" })} className={inp} /></td>
                    <td className="py-1 pe-1 w-[110px]"><input type="number" min="0" step="0.01" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: "" })} className={inp} /></td>
                    <td className="py-1 w-8 text-center"><button onClick={() => removeLine(i)} disabled={lines.length <= 2} className="text-subtle hover:text-danger disabled:opacity-30" title={t("finance.journal.removeLine")}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addLine} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-[11.5px] font-medium text-muted hover:bg-surface-2"><Plus size={13} /> {t("finance.journal.addLine")}</button>

          {/* الإجماليات والتوازن */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2/50 px-3 py-2.5 text-[12.5px]">
            <div className="flex items-center gap-4">
              <span className="text-subtle">{t("finance.journal.totalDebit")}: <span className="tnum font-semibold text-ink">{money(totD)}</span></span>
              <span className="text-subtle">{t("finance.journal.totalCredit")}: <span className="tnum font-semibold text-ink">{money(totC)}</span></span>
            </div>
            <span className={balanced ? "inline-flex items-center gap-1 font-semibold text-success" : "inline-flex items-center gap-1 font-semibold text-warning"}>
              {balanced ? <><Check size={14} /> {t("finance.journal.balanced")}</> : <><Scale size={14} /> {t("finance.journal.diff")}: <span className="tnum">{money(Math.abs(diff))}</span></>}
            </span>
          </div>

          {err ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12px] font-medium text-danger">{err}</p> : null}
          <button onClick={post} disabled={saving || !balanced || desc.trim().length < 2} className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary-strong text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-50"><BookText size={15} /> {saving ? "…" : t("finance.journal.post")}</button>
        </div>
      </section>

      {/* سجلّ القيود */}
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card lg:col-span-2">
        <div className="border-b border-line px-5 py-3.5"><h2 className="text-[15px] font-semibold text-ink">{t("finance.journal.log")}</h2><p className="text-[12px] text-subtle">{t("finance.journal.logSub")}</p></div>
        {vouchers.length === 0 ? (
          <p className="px-5 py-10 text-center text-[12.5px] text-subtle">{t("finance.journal.empty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {vouchers.map((v) => (
              <li key={v.id}>
                <button onClick={() => setOpenV(openV === v.id ? "" : v.id)} className="flex w-full items-center justify-between gap-2 px-5 py-3 text-start hover:bg-surface-2/60">
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium text-ink">{v.lines?.description ?? "—"}</div>
                    <div className="text-[11px] text-subtle tnum">{v.sequenceNo ?? "—"} · {new Date(v.createdAt).toLocaleDateString("en-GB")}</div>
                  </div>
                  <span className="tnum shrink-0 text-[12.5px] font-semibold text-ink">{money(v.amount)}</span>
                </button>
                {openV === v.id && v.lines?.entries ? (
                  <div className="bg-surface-2/40 px-5 py-2">
                    <table className="w-full text-[11.5px]"><tbody>
                      {v.lines.entries.map((e, j) => (
                        <tr key={j}><td className="py-1 text-muted">{e.name}</td><td className="py-1 text-end tnum text-ink">{e.debit ? money(e.debit) : ""}</td><td className="py-1 text-end tnum text-ink">{e.credit ? money(e.credit) : ""}</td></tr>
                      ))}
                    </tbody></table>
                    <div className="pt-1.5 text-end">
                      <Link href={`/tenant/documents/voucher/${v.id}`} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline"><Printer size={12} /> {t("finance.printVoucher")}</Link>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
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
