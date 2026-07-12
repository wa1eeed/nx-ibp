"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer, ArrowLeft, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { Link } from "@/i18n/routing";

interface Branding { primary: string; displayName: string | null; logoUrl: string | null; logoText: string | null }
interface SellerAddress { buildingNo: string | null; street: string | null; district: string | null; city: string | null; postalCode: string | null }
interface LineItem { description: string; quantity: number; unitPrice: number; net: number; taxCategory: string; taxRate: number; taxAmount: number; lineTotal: number }
interface Doc {
  invoice: { id: string; sequenceNo: string | null; kind: string; status: string | null; invoiceTypeCode: string; net: number; vat: number; total: number; issuedAt: string };
  seller: { name: string; vatNumber: string | null; crNumber: string | null; unifiedNumber: string | null; phone: string | null; address: SellerAddress };
  party: { name: string; type: string; vatNumber: string | null; address: string | null };
  lineItems: LineItem[];
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
  const a = doc.seller.address;
  const sellerAddr = [a.buildingNo, a.street, a.district, a.city, a.postalCode].filter(Boolean).join("، ");

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
          {/* البائع + المشتري (مع الرقم الضريبي والعنوان الوطني) */}
          <div className="grid grid-cols-2 gap-6 text-[12.5px]">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: primary }}>{t("seller")}</div>
              <div className="font-bold text-ink">{doc.seller.name}</div>
              {doc.seller.vatNumber ? <div className="text-muted">{t("vat")}: <span className="tnum">{doc.seller.vatNumber}</span></div> : null}
              {doc.seller.crNumber ? <div className="text-muted">{t("cr")}: <span className="tnum">{doc.seller.crNumber}</span></div> : null}
              {sellerAddr ? <div className="text-muted">{sellerAddr}</div> : null}
              {doc.seller.phone ? <div className="text-muted tnum">{doc.seller.phone}</div> : null}
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: primary }}>{doc.party.type === "client" ? t("billedTo") : t("counterparty")}</div>
              <div className="font-bold text-ink">{doc.party.name}</div>
              {doc.party.vatNumber ? <div className="text-muted">{t("vat")}: <span className="tnum">{doc.party.vatNumber}</span></div> : null}
              {doc.party.address ? <div className="text-muted">{doc.party.address}</div> : null}
            </div>
          </div>

          {/* بيانات الفاتورة */}
          <div className="mt-5 grid grid-cols-4 gap-3 rounded-lg bg-surface-2/60 p-3 text-[12px]">
            <div><div className="text-subtle">{t("invoiceNo")}</div><div className="font-semibold text-ink tnum">{doc.invoice.sequenceNo ?? "—"}</div></div>
            <div><div className="text-subtle">{t("date")}</div><div className="font-semibold text-ink tnum">{dateStr}</div></div>
            <div><div className="text-subtle">{t("typeCode")}</div><div className="font-semibold text-ink tnum">{doc.invoice.invoiceTypeCode} · {kindLabel}</div></div>
            {doc.policy?.sequenceNo ? <div><div className="text-subtle">{t("policy")}</div><div className="font-semibold text-ink tnum">{doc.policy.sequenceNo}</div></div> : null}
          </div>

          {/* البنود المفصّلة (وصف · كمية · سعر · فئة/نسبة الضريبة · الضريبة · الإجمالي) */}
          <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[12px]">
            <thead>
              <tr style={{ borderBottom: `2px solid ${primary}` }} className="text-[10.5px] uppercase tracking-wide text-subtle">
                <th className="py-2 text-start font-semibold">{t("description")}</th>
                <th className="py-2 text-center font-semibold">{t("qty")}</th>
                <th className="py-2 text-end font-semibold">{t("unitPrice")}</th>
                <th className="py-2 text-center font-semibold">{t("taxCat")}</th>
                <th className="py-2 text-end font-semibold">{t("lineVat")}</th>
                <th className="py-2 text-end font-semibold">{t("lineTotal")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {doc.lineItems.map((li, i) => (
                <tr key={i}>
                  <td className="py-2.5 text-ink">{li.description}</td>
                  <td className="py-2.5 text-center tnum text-muted">{li.quantity}</td>
                  <td className="py-2.5 text-end tnum text-ink">{fmt(li.unitPrice)}</td>
                  <td className="py-2.5 text-center text-[11px] text-muted">{li.taxCategory === "S" ? t("catS", { rate: li.taxRate }) : t("catE")}</td>
                  <td className="py-2.5 text-end tnum text-muted">{fmt(li.taxAmount)}</td>
                  <td className="py-2.5 text-end tnum font-semibold text-ink">{fmt(li.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* المجاميع */}
          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-[280px] space-y-1 text-[12.5px]">
              <div className="flex justify-between"><span className="text-muted">{t("netTotal")}</span><span className="tnum text-ink">{fmt(doc.invoice.net)}</span></div>
              <div className="flex justify-between"><span className="text-muted">{t("vatTotal")}</span><span className="tnum text-ink">{fmt(doc.invoice.vat)}</span></div>
              <div className="flex justify-between border-t-2 pt-1.5" style={{ borderColor: primary }}><span className="text-[14px] font-bold text-ink">{t("total")}</span><span className="text-[16px] font-bold tnum" style={{ color: primary }}>{fmt(doc.invoice.total)} <span className="text-[11px] font-normal text-subtle">{t("sar")}</span></span></div>
            </div>
          </div>

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
