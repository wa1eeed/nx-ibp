"use client";

import { type ReactNode } from "react";
import { useTranslations } from "next-intl";

export interface CoverDoc {
  coverNote: {
    id: string; sequenceNo: string | null; status: string; expired: boolean;
    insurerName: string | null; productLineCode: string | null;
    sumInsured: number | null; premium: number | null; totalPremium: number | null;
    deductible: number | null; limit: number | null;
    startDate: string | null; endDate: string | null; validUntil: string; notes: string | null; issuedAt: string;
  };
  seller: { name: string; nameEn: string | null; vatNumber: string | null; crNumber: string | null; phone: string | null; address: { buildingNo: string | null; street: string | null; district: string | null; city: string | null; postalCode: string | null } };
  client: { name: string; vatNumber: string | null; address: string | null } | null;
}
interface Branding { primary: string; displayName: string | null; logoUrl: string | null; logoText: string | null }

/** جسم مذكرة التغطية المؤقتة القابل للطباعة (بهوية المستأجر) — يُستخدم من الوسيط والبوّابة. */
export function CoverNoteDoc({ doc, branding, icon }: { doc: CoverDoc; branding: Branding | null; icon: ReactNode }) {
  const t = useTranslations("coverNoteDoc");
  const primary = branding?.primary || "#0d9488";
  const brand = branding?.displayName || branding?.logoText || doc.seller.name || "IBP";
  const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const num = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));
  const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");
  const a = doc.seller.address;
  const sellerAddr = [a.buildingNo, a.street, a.district, a.city, a.postalCode].filter(Boolean).join("، ");
  const c = doc.coverNote;
  const statusLabel = c.status === "superseded" ? t("status.superseded") : c.status === "cancelled" ? t("status.cancelled") : c.expired ? t("status.expired") : t("status.active");

  return (
    <div className="mx-auto overflow-hidden rounded-lg border border-line bg-white shadow-card print:border-0 print:shadow-none">
      <div className="flex items-center justify-between px-8 py-6" style={{ background: primary, color: "#fff" }}>
        <div className="flex items-center gap-3">
          {branding?.logoUrl ? <img src={branding.logoUrl} alt={brand} className="max-h-11 max-w-[150px] object-contain" /> : <span className="text-[22px] font-bold">{brand}</span>}
        </div>
        <div className="text-end">
          <div className="text-[18px] font-bold">{t("title")}</div>
          <div className="text-[12px] opacity-90">Cover Note</div>
        </div>
      </div>

      <div className="px-8 py-6">
        <div className="grid grid-cols-2 gap-6 text-[12.5px]">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: primary }}>{t("broker")}</div>
            <div className="font-bold text-ink">{doc.seller.name}</div>
            {doc.seller.vatNumber ? <div className="text-muted">{t("vat")}: <span className="tnum">{doc.seller.vatNumber}</span></div> : null}
            {doc.seller.crNumber ? <div className="text-muted">{t("cr")}: <span className="tnum">{doc.seller.crNumber}</span></div> : null}
            {sellerAddr ? <div className="text-muted">{sellerAddr}</div> : null}
            {doc.seller.phone ? <div className="text-muted tnum">{doc.seller.phone}</div> : null}
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: primary }}>{t("insured")}</div>
            <div className="font-bold text-ink">{doc.client?.name ?? "—"}</div>
            {doc.client?.vatNumber ? <div className="text-muted">{t("vat")}: <span className="tnum">{doc.client.vatNumber}</span></div> : null}
            {doc.client?.address ? <div className="text-muted">{doc.client.address}</div> : null}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-3 rounded-lg bg-surface-2/60 p-3 text-[12px]">
          <div><div className="text-subtle">{t("no")}</div><div className="font-semibold text-ink tnum">{c.sequenceNo ?? "—"}</div></div>
          <div><div className="text-subtle">{t("issuedAt")}</div><div className="font-semibold text-ink tnum">{date(c.issuedAt)}</div></div>
          <div><div className="text-subtle">{t("insurer")}</div><div className="font-semibold text-ink">{c.insurerName ?? "—"}</div></div>
          <div><div className="text-subtle">{t("line")}</div><div className="font-semibold text-ink">{c.productLineCode ?? "—"}</div></div>
        </div>

        {/* شروط التغطية */}
        <div className="mt-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: primary }}>{t("coverTerms")}</div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-3">
            <div className="flex justify-between border-b border-line pb-1"><dt className="text-muted">{t("sumInsured")}</dt><dd className="tnum font-medium text-ink">{num(c.sumInsured)}</dd></div>
            <div className="flex justify-between border-b border-line pb-1"><dt className="text-muted">{t("limit")}</dt><dd className="tnum font-medium text-ink">{num(c.limit)}</dd></div>
            <div className="flex justify-between border-b border-line pb-1"><dt className="text-muted">{t("deductible")}</dt><dd className="tnum font-medium text-ink">{num(c.deductible)}</dd></div>
            <div className="flex justify-between border-b border-line pb-1"><dt className="text-muted">{t("premium")}</dt><dd className="tnum font-medium text-ink">{fmt(c.premium)}</dd></div>
            <div className="flex justify-between border-b border-line pb-1"><dt className="text-muted">{t("total")}</dt><dd className="tnum font-semibold text-ink">{fmt(c.totalPremium)}</dd></div>
            <div className="flex justify-between border-b border-line pb-1"><dt className="text-muted">{t("period")}</dt><dd className="tnum text-ink">{date(c.startDate)} — {date(c.endDate)}</dd></div>
          </dl>
        </div>

        {/* صلاحية المذكرة المؤقتة */}
        <div className="mt-5 flex items-center justify-between rounded-lg border-2 p-3.5" style={{ borderColor: primary }}>
          <div>
            <div className="text-[11px] text-subtle">{t("validUntil")}</div>
            <div className="text-[16px] font-bold tnum text-ink">{date(c.validUntil)}</div>
          </div>
          <span className="rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: `${primary}1a`, color: primary }}>{statusLabel}</span>
        </div>

        {c.notes ? <p className="mt-4 rounded-lg bg-surface-2/60 px-3 py-2 text-[11.5px] text-muted">{c.notes}</p> : null}

        <div className="mt-6 flex items-start gap-3 rounded-lg border border-line bg-surface-2/40 p-3">
          <span style={{ color: primary }} className="mt-0.5 shrink-0">{icon}</span>
          <div className="text-[10.5px] text-muted">
            <div className="font-semibold text-ink">{t("disclaimerTitle")}</div>
            <div className="mt-0.5 leading-relaxed">{t("disclaimer")}</div>
          </div>
        </div>

        <p className="mt-5 text-center text-[10.5px] text-subtle">{t("footer", { brand })}</p>
      </div>
    </div>
  );
}
