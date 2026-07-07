"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer, ArrowLeft, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { Link } from "@/i18n/routing";

interface Branding { primary: string; displayName: string | null; logoUrl: string | null; logoText: string | null }
interface Doc {
  invoice: { id: string; sequenceNo: string | null; kind: string; status: string | null; net: number; vat: number; total: number; issuedAt: string };
  seller: { name: string; vatNumber: string | null; crNumber: string | null; unifiedNumber: string | null; phone: string | null };
  party: { name: string; type: string };
  policy: { sequenceNo: string | null; productLineCode: string | null } | null;
  zatca: { uuid: string; hash: string; qr: string };
}

export default function InvoiceDocumentPage({ params }: { params: { id: string } }) {
  const t = useTranslations("invoiceDoc");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [b, setB] = useState<Branding | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [d, br] = await Promise.all([api<Doc>(`/finance/invoices/${params.id}/document`), api<Branding>("/branding")]);
      setDoc(d); setB(br);
    } catch { setError(t("notFound")); }
  }, [params.id, t]);
  useEffect(() => { void load(); }, [load]);

  const primary = b?.primary || "#0d9488";
  const brand = b?.displayName || b?.logoText || "IBP";
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateStr = doc ? new Date(doc.invoice.issuedAt).toLocaleDateString("en-GB") : "";

  if (error) return <div className="mx-auto max-w-lg p-8 text-center text-[13px] text-danger">{error}</div>;
  if (!doc) return <div className="mx-auto max-w-lg p-8 text-center text-[13px] text-subtle">…</div>;

  const kindLabel = doc.invoice.kind === "FEES" ? t("kindFees") : t("kindCommission");

  return (
    <div className="mx-auto max-w-[820px] p-4 print:p-0">
      {/* شريط الأدوات — يُخفى عند الطباعة */}
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/tenant/finance" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"><ArrowLeft size={15} className="rtl:rotate-180" /> {t("back")}</Link>
        <button onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary">
          <Printer size={16} /> {t("print")}
        </button>
      </div>

      {/* الوثيقة (A4) — بهوية المستأجر */}
      <div className="mx-auto overflow-hidden rounded-lg border border-line bg-white shadow-card print:border-0 print:shadow-none" id="doc">
        {/* ترويسة بالهوية */}
        <div className="flex items-center justify-between px-8 py-6" style={{ background: primary, color: "#fff" }}>
          <div className="flex items-center gap-3">
            {b?.logoUrl ? <img src={b.logoUrl} alt={brand} className="max-h-11 max-w-[150px] object-contain" /> : <span className="text-[22px] font-bold">{brand}</span>}
          </div>
          <div className="text-end">
            <div className="text-[18px] font-bold">{t("title")}</div>
            <div className="text-[12px] opacity-90">Tax Invoice</div>
          </div>
        </div>

        <div className="px-8 py-6">
          {/* البائع + الطرف */}
          <div className="grid grid-cols-2 gap-6 text-[12.5px]">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: primary }}>{t("seller")}</div>
              <div className="font-bold text-ink">{doc.seller.name}</div>
              {doc.seller.vatNumber ? <div className="text-muted">{t("vat")}: <span className="tnum">{doc.seller.vatNumber}</span></div> : null}
              {doc.seller.crNumber ? <div className="text-muted">{t("cr")}: <span className="tnum">{doc.seller.crNumber}</span></div> : null}
              {doc.seller.phone ? <div className="text-muted tnum">{doc.seller.phone}</div> : null}
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: primary }}>{doc.party.type === "client" ? t("billedTo") : t("counterparty")}</div>
              <div className="font-bold text-ink">{doc.party.name}</div>
            </div>
          </div>

          {/* بيانات الفاتورة */}
          <div className="mt-5 grid grid-cols-3 gap-3 rounded-lg bg-surface-2/60 p-3 text-[12px]">
            <div><div className="text-subtle">{t("invoiceNo")}</div><div className="font-semibold text-ink tnum">{doc.invoice.sequenceNo ?? "—"}</div></div>
            <div><div className="text-subtle">{t("date")}</div><div className="font-semibold text-ink tnum">{dateStr}</div></div>
            <div><div className="text-subtle">{t("kind")}</div><div className="font-semibold text-ink">{kindLabel}</div></div>
            {doc.policy?.sequenceNo ? <div><div className="text-subtle">{t("policy")}</div><div className="font-semibold text-ink tnum">{doc.policy.sequenceNo}</div></div> : null}
          </div>

          {/* البنود */}
          <table className="mt-5 w-full text-[12.5px]">
            <thead>
              <tr style={{ borderBottom: `2px solid ${primary}` }} className="text-[11px] uppercase tracking-wide text-subtle">
                <th className="py-2 text-start font-semibold">{t("description")}</th>
                <th className="py-2 text-end font-semibold">{t("amount")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr><td className="py-2.5 text-ink">{kindLabel}{doc.policy?.productLineCode ? ` · ${doc.policy.productLineCode}` : ""}</td><td className="py-2.5 text-end tnum text-ink">{fmt(doc.invoice.net)}</td></tr>
              <tr><td className="py-2.5 text-muted">{t("vat15")}</td><td className="py-2.5 text-end tnum text-muted">{fmt(doc.invoice.vat)}</td></tr>
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${primary}` }}>
                <td className="py-3 text-[14px] font-bold text-ink">{t("total")}</td>
                <td className="py-3 text-end text-[16px] font-bold tnum" style={{ color: primary }}>{fmt(doc.invoice.total)} <span className="text-[11px] font-normal text-subtle">{t("sar")}</span></td>
              </tr>
            </tfoot>
          </table>

          {/* ZATCA */}
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-line bg-surface-2/40 p-3">
            <ShieldCheck size={18} style={{ color: primary }} className="mt-0.5 shrink-0" />
            <div className="text-[10.5px] text-muted" dir="ltr">
              <div className="font-semibold text-ink">ZATCA · {t("zatcaCompliant")}</div>
              <div className="mt-0.5 break-all">UUID: {doc.zatca.uuid}</div>
              <div className="break-all">Hash: {doc.zatca.hash}</div>
            </div>
          </div>

          <p className="mt-5 text-center text-[10.5px] text-subtle">{t("footer", { brand })}</p>
        </div>
      </div>
    </div>
  );
}
