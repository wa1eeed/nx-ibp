"use client";

import { useEffect, useState } from "react";
import { TrendingUp, HandCoins, Percent, ShieldAlert, FileBarChart, FileSpreadsheet, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, downloadFile } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Production {
  totalGwp: number; netPremium: number; vat: number; commission: number; policyCount: number;
  conversionRate: number; nonAwardedQuotes: number;
  byLine: { line: string; premium: number; count: number }[];
  byInsurer: { insurer: string; premium: number; count: number }[];
}
interface Claims { byStatus: { status: string; count: number }[]; totalClaimed: number; totalSettled: number; lossRatio: number }
interface Regulatory { grossWrittenPremium: number; netPremium: number; vat: number; brokerageCommission: number; claimsCount: number; claimsSettled: number; byProductLine: { line: string; premium: number; count: number }[] }
interface CatalogItem { key: string; name: string; category: string }
interface BordereauRow { sequenceNo: string; clientName: string; productLine: string | null; insurerName: string | null; startDate: string | null; endDate: string | null; netPremium: number; vat: number; gross: number; commission: number; netToInsurer: number }
interface Bordereau {
  insurer: string | null; from: string | null; to: string | null;
  insurers: { name: string; count: number }[];
  rows: BordereauRow[];
  totals: { count: number; netPremium: number; vat: number; gross: number; commission: number; netToInsurer: number };
}

export default function ReportsPage() {
  const t = useTranslations();
  const [prod, setProd] = useState<Production | null>(null);
  const [claims, setClaims] = useState<Claims | null>(null);
  const [reg, setReg] = useState<Regulatory | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [bord, setBord] = useState<Bordereau | null>(null);
  const [bInsurer, setBInsurer] = useState("");
  const [bFrom, setBFrom] = useState("");
  const [bTo, setBTo] = useState("");

  const loadBordereau = () => {
    const qs = new URLSearchParams();
    if (bInsurer) qs.set("insurer", bInsurer);
    if (bFrom) qs.set("from", bFrom);
    if (bTo) qs.set("to", bTo);
    const q = qs.toString();
    void api<Bordereau>(`/reports/bordereau${q ? `?${q}` : ""}`).then(setBord).catch(() => undefined);
  };

  useEffect(() => {
    void api<Production>("/reports/production").then(setProd).catch(() => undefined);
    void api<Claims>("/reports/claims").then(setClaims).catch(() => undefined);
    void api<Regulatory>("/reports/regulatory").then(setReg).catch(() => undefined);
    void api<CatalogItem[]>("/reports/catalog").then(setCatalog).catch(() => undefined);
    void api<Bordereau>("/reports/bordereau").then(setBord).catch(() => undefined);
  }, []);

  const fmt = (n: number) => n.toLocaleString("en-US");
  const maxLine = Math.max(1, ...(prod?.byLine.map((l) => l.premium) ?? [1]));
  const CAT_TONE: Record<string, BadgeTone> = { production: "info", finance: "success", claims: "warning", compliance: "danger", regulatory: "neutral" };

  return (
    <div className="space-y-6">
      <PageHeader title={t("reports.title")} subtitle={t("reports.subtitle")} />

      {/* مؤشرات رئيسية */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="primary" icon={<TrendingUp size={18} />} title={t("reports.gwp")} value={<span className="tnum">{prod ? fmt(prod.totalGwp) : "…"}</span>} sub={t("common.sar")} />
        <StatCard tone="success" icon={<HandCoins size={18} />} title={t("reports.commission")} value={<span className="tnum">{prod ? fmt(prod.commission) : "…"}</span>} sub={t("common.sar")} />
        <StatCard tone="info" icon={<Percent size={18} />} title={t("reports.conversion")} value={prod ? `${prod.conversionRate}%` : "…"} sub={t("reports.conversionSub")} />
        <StatCard tone="danger" icon={<ShieldAlert size={18} />} title={t("reports.lossRatio")} value={claims ? `${claims.lossRatio}%` : "…"} sub={t("reports.lossRatioSub")} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* الإنتاج حسب الفرع */}
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <h2 className="mb-4 text-[15px] font-semibold text-ink">{t("reports.byLine")}</h2>
          <ul className="space-y-3">
            {prod?.byLine.map((l) => (
              <li key={l.line}>
                <div className="mb-1 flex items-center justify-between text-[12.5px]">
                  <span className="font-medium text-ink">{l.line} <span className="text-subtle">({l.count})</span></span>
                  <span className="tnum text-muted">{fmt(l.premium)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary" style={{ width: `${(l.premium / maxLine) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>

        {/* الإنتاج حسب الشركة */}
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <h2 className="mb-4 text-[15px] font-semibold text-ink">{t("reports.byInsurer")}</h2>
          <table className="w-full">
            <tbody className="divide-y divide-line">
              {prod?.byInsurer.map((i) => (
                <tr key={i.insurer}>
                  <td className="py-2.5 text-[13px] text-ink">{i.insurer}</td>
                  <td className="py-2.5 text-end text-[12px] text-subtle tnum">{i.count}</td>
                  <td className="py-2.5 text-end text-[13px] font-medium text-ink tnum">{fmt(i.premium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* المطالبات حسب الحالة */}
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <h2 className="mb-4 text-[15px] font-semibold text-ink">{t("reports.claimsByStatus")}</h2>
          <div className="flex flex-wrap gap-2">
            {claims?.byStatus.map((c) => (
              <div key={c.status} className="rounded-lg border border-line bg-surface-2/40 px-3 py-2">
                <div className="text-[18px] font-bold text-ink tnum">{c.count}</div>
                <div className="text-[11px] text-subtle">{c.status}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4 border-t border-line pt-3 text-[12.5px]">
            <span className="text-muted">{t("reports.claimed")}: <span className="font-semibold text-ink tnum">{claims ? fmt(claims.totalClaimed) : "…"}</span></span>
            <span className="text-muted">{t("reports.settled")}: <span className="font-semibold text-success tnum">{claims ? fmt(claims.totalSettled) : "…"}</span></span>
          </div>
        </section>

        {/* تقرير هيئة التأمين */}
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <h2 className="mb-4 text-[15px] font-semibold text-ink">{t("reports.regulatory")}</h2>
          <dl className="space-y-2.5 text-[13px]">
            <div className="flex justify-between"><dt className="text-muted">{t("reports.reg.gwp")}</dt><dd className="font-semibold text-ink tnum">{reg ? fmt(reg.grossWrittenPremium) : "…"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">{t("reports.reg.net")}</dt><dd className="text-ink tnum">{reg ? fmt(reg.netPremium) : "…"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">{t("reports.reg.vat")}</dt><dd className="text-ink tnum">{reg ? fmt(reg.vat) : "…"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">{t("reports.reg.commission")}</dt><dd className="font-semibold text-success tnum">{reg ? fmt(reg.brokerageCommission) : "…"}</dd></div>
            <div className="flex justify-between border-t border-line pt-2.5"><dt className="text-muted">{t("reports.reg.claims")}</dt><dd className="text-ink tnum">{reg ? `${reg.claimsCount} · ${fmt(reg.claimsSettled)}` : "…"}</dd></div>
          </dl>
        </section>
      </div>

      {/* كشف المؤمِّن الدوري (Bordereau) */}
      <section className="rounded-card border border-line bg-card shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={17} className="text-primary" />
            <h2 className="text-[15px] font-semibold text-ink">{t("reports.bordereau.title")}</h2>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-subtle">{t("reports.bordereau.insurer")}</span>
              <select value={bInsurer} onChange={(e) => setBInsurer(e.target.value)} className="h-9 rounded-lg border border-line bg-surface-2/40 px-2.5 text-[13px] text-ink outline-none focus:border-primary">
                <option value="">{t("reports.bordereau.allInsurers")}</option>
                {bord?.insurers.map((i) => <option key={i.name} value={i.name}>{i.name} ({i.count})</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-subtle">{t("reports.bordereau.from")}</span>
              <input type="date" value={bFrom} onChange={(e) => setBFrom(e.target.value)} className="h-9 rounded-lg border border-line bg-surface-2/40 px-2.5 text-[13px] text-ink outline-none focus:border-primary" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-subtle">{t("reports.bordereau.to")}</span>
              <input type="date" value={bTo} onChange={(e) => setBTo(e.target.value)} className="h-9 rounded-lg border border-line bg-surface-2/40 px-2.5 text-[13px] text-ink outline-none focus:border-primary" />
            </label>
            <button onClick={loadBordereau} className="h-9 rounded-lg bg-primary px-4 text-[13px] font-medium text-white hover:bg-primary/90">{t("reports.bordereau.apply")}</button>
            <button onClick={() => { const qs = new URLSearchParams(); if (bInsurer) qs.set("insurer", bInsurer); if (bFrom) qs.set("from", bFrom); if (bTo) qs.set("to", bTo); const q = qs.toString(); void downloadFile(`/reports/export/bordereau${q ? `?${q}` : ""}`, "bordereau.csv").catch(() => undefined); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 text-[13px] font-medium text-muted hover:bg-surface-2"><Download size={15} /> {t("reports.exportCsv")}</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-line text-[11.5px] text-subtle">
                <th className="px-4 py-2.5 text-start font-medium">{t("reports.bordereau.col.policy")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("reports.bordereau.col.client")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("reports.bordereau.col.line")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("reports.bordereau.col.insurer")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("reports.bordereau.col.net")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("reports.bordereau.col.vat")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("reports.bordereau.col.gross")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("reports.bordereau.col.commission")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("reports.bordereau.col.netToInsurer")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bord?.rows.map((r) => (
                <tr key={r.sequenceNo} className="text-[12.5px]">
                  <td className="px-4 py-2.5 font-medium text-ink tnum">{r.sequenceNo}</td>
                  <td className="px-4 py-2.5 text-ink">{r.clientName}</td>
                  <td className="px-4 py-2.5 text-muted">{r.productLine ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{r.insurerName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-end text-ink tnum">{fmt(r.netPremium)}</td>
                  <td className="px-4 py-2.5 text-end text-muted tnum">{fmt(r.vat)}</td>
                  <td className="px-4 py-2.5 text-end text-ink tnum">{fmt(r.gross)}</td>
                  <td className="px-4 py-2.5 text-end text-danger tnum">{fmt(r.commission)}</td>
                  <td className="px-4 py-2.5 text-end font-semibold text-success tnum">{fmt(r.netToInsurer)}</td>
                </tr>
              ))}
              {bord && bord.rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-[13px] text-subtle">{t("reports.bordereau.empty")}</td></tr>
              )}
            </tbody>
            {bord && bord.rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-line bg-surface-2/30 text-[12.5px] font-semibold text-ink">
                  <td className="px-4 py-3" colSpan={4}>{t("reports.bordereau.total")} <span className="text-subtle tnum">({bord.totals.count})</span></td>
                  <td className="px-4 py-3 text-end tnum">{fmt(bord.totals.netPremium)}</td>
                  <td className="px-4 py-3 text-end tnum">{fmt(bord.totals.vat)}</td>
                  <td className="px-4 py-3 text-end tnum">{fmt(bord.totals.gross)}</td>
                  <td className="px-4 py-3 text-end text-danger tnum">{fmt(bord.totals.commission)}</td>
                  <td className="px-4 py-3 text-end text-success tnum">{fmt(bord.totals.netToInsurer)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* كتالوج التقارير الـ12 */}
      <section className="rounded-card border border-line bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <FileBarChart size={17} className="text-primary" />
          <h2 className="text-[15px] font-semibold text-ink">{t("reports.catalogTitle")}</h2>
        </div>
        <ul className="grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
          {catalog.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="text-[13px] text-ink">{r.name}</span>
              <Badge tone={CAT_TONE[r.category] ?? "neutral"}>{t(`reports.cat.${r.category}`)}</Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
