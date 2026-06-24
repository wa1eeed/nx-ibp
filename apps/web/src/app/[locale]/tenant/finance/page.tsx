"use client";

import { Fragment, useEffect, useState } from "react";
import { Landmark, Wallet2, ShieldCheck, FileText, QrCode } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";

interface Summary { grossPremium: number; netPremium: number; vat: number; commission: number; offBalanceTrust: number; receivables: number; invoiceCount: number; voucherCount: number }
interface Coa { id: string; code: string; name: string; level: number; isOnBalance: boolean; isLocked: boolean; accountType: string | null }
interface Invoice { id: string; sequenceNo: string | null; insurerName: string | null; netAmount: string | null; vatAmount: string | null; totalAmount: string | null; status: string | null; zatca: { qr: string; uuid: string; hash: string } }

export default function FinancePage() {
  const t = useTranslations();
  const [s, setS] = useState<Summary | null>(null);
  const [coa, setCoa] = useState<Coa[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [open, setOpen] = useState("");

  useEffect(() => {
    void api<Summary>("/finance/summary").then(setS).catch(() => undefined);
    void api<Coa[]>("/finance/coa").then(setCoa).catch(() => undefined);
    void api<Invoice[]>("/finance/invoices").then(setInvoices).catch(() => undefined);
  }, []);

  const fmt = (n: string | number | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

  return (
    <div className="space-y-6">
      <PageHeader title={t("finance.title")} subtitle={t("finance.subtitle")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="primary" icon={<Landmark size={18} />} title={t("finance.grossPremium")} value={<span className="tnum">{s ? fmt(s.grossPremium) : "…"}</span>} sub={t("common.sar")} />
        <StatCard tone="success" icon={<Wallet2 size={18} />} title={t("finance.commission")} value={<span className="tnum">{s ? fmt(s.commission) : "…"}</span>} sub={t("common.sar")} />
        <StatCard tone="info" icon={<ShieldCheck size={18} />} title={t("finance.offBalance")} value={<span className="tnum">{s ? fmt(s.offBalanceTrust) : "…"}</span>} sub={t("finance.offBalanceSub")} />
        <StatCard tone="warning" icon={<FileText size={18} />} title={t("finance.receivables")} value={<span className="tnum">{s ? fmt(s.receivables) : "…"}</span>} sub={t("common.sar")} />
      </div>

      {/* شجرة الحسابات */}
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
              {coa.map((a) => (
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
      </section>

      {/* الفواتير الضريبية + ZATCA */}
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <QrCode size={17} className="text-success" />
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{t("finance.invoices")}</h2>
            <p className="text-[12px] text-subtle">{t("finance.invoicesSub")}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("finance.col.invoiceNo")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("finance.col.insurer")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("finance.col.total")}</th>
              <th className="px-5 py-3 text-start font-semibold">ZATCA</th>
              <th className="px-5 py-3"></th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {invoices.map((inv) => (
                <Fragment key={inv.id}>
                  <tr className="hover:bg-surface-2/60">
                    <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{inv.sequenceNo ?? "—"}</td>
                    <td className="px-5 py-3 text-[13px] text-muted">{inv.insurerName ?? "—"}</td>
                    <td className="px-5 py-3 text-[13px] font-medium text-ink tnum">{fmt(inv.totalAmount)} <span className="text-[11px] text-subtle">{t("common.sar")}</span></td>
                    <td className="px-5 py-3"><Badge tone="success"><ShieldCheck size={12} /> {t("finance.zatcaOk")}</Badge></td>
                    <td className="px-5 py-3 text-end">
                      <button onClick={() => setOpen(open === inv.id ? "" : inv.id)} className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2 hover:text-ink">{t("finance.zatcaShow")}</button>
                    </td>
                  </tr>
                  {open === inv.id ? (
                    <tr className="bg-surface-2/40">
                      <td colSpan={5} className="px-5 py-3">
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
      </section>
    </div>
  );
}
