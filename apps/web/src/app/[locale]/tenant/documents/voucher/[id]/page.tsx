"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer, ArrowLeft, ReceiptText } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { Link } from "@/i18n/routing";

interface Entry { account: string; name: string; debit: number; credit: number }
interface Doc {
  voucher: { id: string; type: string; sequenceNo: string | null; amount: number | null; status: string | null; description: string | null; method: string | null; ref: string | null; issuedAt: string };
  seller: { name: string; nameEn: string | null; vatNumber: string | null; crNumber: string | null; phone: string | null; address: { buildingNo: string | null; street: string | null; district: string | null; city: string | null; postalCode: string | null } };
  party: { name: string; type: string | null } | null;
  entries: Entry[];
}
interface Branding { primary: string; displayName: string | null; logoUrl: string | null; logoText: string | null }

export default function VoucherDocumentPage({ params }: { params: { id: string } }) {
  const t = useTranslations("voucherDoc");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [b, setB] = useState<Branding | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [d, br] = await Promise.all([api<Doc>(`/finance/vouchers/${params.id}/document`), api<Branding>("/branding")]);
      setDoc(d); setB(br);
    } catch { setError(t("notFound")); }
  }, [params.id, t]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="mx-auto max-w-lg p-8 text-center text-[13px] text-danger">{error}</div>;
  if (!doc) return <div className="mx-auto max-w-lg p-8 text-center text-[13px] text-subtle">…</div>;

  const primary = b?.primary || "#0d9488";
  const brand = b?.displayName || b?.logoText || doc.seller.name || "IBP";
  const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const date = (d: string) => new Date(d).toLocaleDateString("en-GB");
  const v = doc.voucher;
  const typeLabel = t(`type.${v.type}`);
  const a = doc.seller.address;
  const sellerAddr = [a.buildingNo, a.street, a.district, a.city, a.postalCode].filter(Boolean).join("، ");
  const totD = doc.entries.reduce((s, e) => s + e.debit, 0);
  const totC = doc.entries.reduce((s, e) => s + e.credit, 0);

  return (
    <div className="mx-auto max-w-[820px] p-4 print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/tenant/finance" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"><ArrowLeft size={15} className="rtl:rotate-180" /> {t("back")}</Link>
        <button onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary"><Printer size={16} /> {t("print")}</button>
      </div>

      <div className="mx-auto overflow-hidden rounded-lg border border-line bg-white shadow-card print:border-0 print:shadow-none">
        <div className="flex items-center justify-between px-8 py-6" style={{ background: primary, color: "#fff" }}>
          <div className="flex items-center gap-3">
            {b?.logoUrl ? <img src={b.logoUrl} alt={brand} className="max-h-11 max-w-[150px] object-contain" /> : <span className="text-[22px] font-bold">{brand}</span>}
          </div>
          <div className="text-end">
            <div className="text-[18px] font-bold">{typeLabel}</div>
            <div className="text-[12px] opacity-90">Voucher</div>
          </div>
        </div>

        <div className="px-8 py-6">
          <div className="grid grid-cols-2 gap-6 text-[12.5px]">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: primary }}>{t("issuer")}</div>
              <div className="font-bold text-ink">{doc.seller.name}</div>
              {doc.seller.vatNumber ? <div className="text-muted">{t("vat")}: <span className="tnum">{doc.seller.vatNumber}</span></div> : null}
              {doc.seller.crNumber ? <div className="text-muted">{t("cr")}: <span className="tnum">{doc.seller.crNumber}</span></div> : null}
              {sellerAddr ? <div className="text-muted">{sellerAddr}</div> : null}
            </div>
            {doc.party ? (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: primary }}>{doc.party.type === "insurer" ? t("insurer") : t("party")}</div>
                <div className="font-bold text-ink">{doc.party.name}</div>
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid grid-cols-4 gap-3 rounded-lg bg-surface-2/60 p-3 text-[12px]">
            <div><div className="text-subtle">{t("no")}</div><div className="font-semibold text-ink tnum">{v.sequenceNo ?? "—"}</div></div>
            <div><div className="text-subtle">{t("date")}</div><div className="font-semibold text-ink tnum">{date(v.issuedAt)}</div></div>
            <div><div className="text-subtle">{t("method")}</div><div className="font-semibold text-ink">{v.method ? t(`methodOpt.${v.method}`) : "—"}</div></div>
            {v.ref ? <div><div className="text-subtle">{t("ref")}</div><div className="font-semibold text-ink tnum">{v.ref}</div></div> : null}
          </div>

          {v.description ? <p className="mt-4 text-[13px] text-ink">{v.description}</p> : null}

          {/* المبلغ */}
          <div className="mt-4 flex items-center justify-between rounded-lg border-2 p-4" style={{ borderColor: primary }}>
            <span className="text-[13px] font-semibold text-ink">{t("amount")}</span>
            <span className="text-[20px] font-bold tnum" style={{ color: primary }}>{fmt(v.amount)} <span className="text-[11px] font-normal text-subtle">{t("sar")}</span></span>
          </div>

          {/* أطراف القيد */}
          {doc.entries.length ? (
            <div className="mt-5 overflow-x-auto">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: primary }}>{t("entries")}</div>
              <table className="w-full min-w-[420px] text-[12px]">
                <thead><tr style={{ borderBottom: `2px solid ${primary}` }} className="text-[10.5px] uppercase tracking-wide text-subtle">
                  <th className="py-2 text-start font-semibold">{t("account")}</th>
                  <th className="py-2 text-end font-semibold">{t("debit")}</th>
                  <th className="py-2 text-end font-semibold">{t("credit")}</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {doc.entries.map((e, i) => (
                    <tr key={i}>
                      <td className="py-2 text-ink">{e.name} <span className="text-[10px] text-subtle tnum">{e.account.replace(/0+$/, "") || e.account}</span></td>
                      <td className="py-2 text-end tnum text-ink">{e.debit ? fmt(e.debit) : "—"}</td>
                      <td className="py-2 text-end tnum text-ink">{e.credit ? fmt(e.credit) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 font-semibold" style={{ borderColor: primary }}>
                  <td className="py-2 text-ink">{t("total")}</td>
                  <td className="py-2 text-end tnum text-ink">{fmt(totD)}</td>
                  <td className="py-2 text-end tnum text-ink">{fmt(totC)}</td>
                </tr></tfoot>
              </table>
            </div>
          ) : null}

          <div className="mt-6 flex items-start gap-3 rounded-lg border border-line bg-surface-2/40 p-3">
            <ReceiptText size={18} style={{ color: primary }} className="mt-0.5 shrink-0" />
            <p className="text-[10.5px] leading-relaxed text-muted">{t("footer", { brand })}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
