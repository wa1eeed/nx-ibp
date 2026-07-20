"use client";

import { useCallback, useEffect, useState } from "react";
import { Boxes, FileCheck2, Plus, CheckCircle2, Circle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { api, getToken } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/ui/PageHeader";

interface Line { code: string; name: string; hasForm: boolean; count: number; premium: number }
interface Cls { code: string; name: string; vatRate: number; lines: Line[] }

export default function ProductsPage() {
  const t = useTranslations("products");
  const router = useRouter();
  const { can } = usePermissions();
  const canCreateRequest = can("sales", "create");
  const [classes, setClasses] = useState<Cls[]>([]);

  const load = useCallback(async () => setClasses(await api<Cls[]>("/catalog/stats")), []);
  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    void load().catch(() => undefined);
  }, [load, router]);

  const fmt = (n: number) => n.toLocaleString("en-US");
  const totalLines = classes.reduce((s, c) => s + c.lines.length, 0);
  const totalPremium = classes.reduce((s, c) => s + c.lines.reduce((a, l) => a + l.premium, 0), 0);
  const activeLines = classes.reduce((s, c) => s + c.lines.filter((l) => l.count > 0).length, 0);

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* ملخّص */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-card border border-line bg-card p-3.5 shadow-card"><div className="mb-1 text-[11px] font-medium text-subtle">{t("classes")}</div><div className="tnum text-[19px] font-bold text-ink">{classes.length}</div></div>
        <div className="rounded-card border border-line bg-card p-3.5 shadow-card"><div className="mb-1 text-[11px] font-medium text-subtle">{t("lines")}</div><div className="tnum text-[19px] font-bold text-ink">{totalLines}</div></div>
        <div className="rounded-card border border-line bg-card p-3.5 shadow-card"><div className="mb-1 text-[11px] font-medium text-subtle">{t("activeLines")}</div><div className="tnum text-[19px] font-bold text-ink">{activeLines}</div></div>
        <div className="rounded-card border border-line bg-card p-3.5 shadow-card"><div className="mb-1 text-[11px] font-medium text-subtle">{t("totalPremium")}</div><div className="tnum text-[17px] font-bold text-ink">{fmt(totalPremium)} <span className="text-[10px] font-normal text-subtle">{t("sar")}</span></div></div>
      </div>

      {classes.length === 0 ? (
        <div className="grid min-h-[36vh] place-items-center rounded-card border border-dashed border-line bg-card text-center shadow-card text-muted"><div><Boxes size={28} className="mx-auto mb-2 text-subtle" /><p className="text-[13px]">…</p></div></div>
      ) : (
        <div className="space-y-4">
          {classes.map((c) => (
            <section key={c.code} className="overflow-hidden rounded-card border border-line bg-card shadow-card">
              <div className="flex items-center justify-between border-b border-line bg-surface-2/40 px-5 py-3">
                <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink"><Boxes size={16} className="text-primary" /> {c.name} <span className="text-[11px] font-normal text-subtle">({c.code})</span></h2>
                <span className={["rounded-full px-2 py-0.5 text-[11px] font-semibold", c.vatRate === 0 ? "bg-success-soft text-success" : "bg-surface-2 text-subtle"].join(" ")}>
                  {c.vatRate === 0 ? t("vatExempt") : t("vatStandard", { rate: c.vatRate })}
                </span>
              </div>
              <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
                {c.lines.map((l) => (
                  <div key={l.code} className="flex items-start justify-between gap-2 border-line px-4 py-3 sm:border-b sm:[&:nth-child(odd)]:border-e lg:[&:nth-child(3n+1)]:border-e lg:[&:nth-child(3n+2)]:border-e">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-ink">{l.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-subtle">
                        <span className="tnum">{l.code}</span>
                        {l.hasForm ? <span className="inline-flex items-center gap-0.5 text-success"><CheckCircle2 size={11} /> {t("formReady")}</span> : <span className="inline-flex items-center gap-0.5"><Circle size={11} /> {t("noForm")}</span>}
                      </div>
                      {l.count > 0 ? (
                        <div className="mt-1 flex items-center gap-2 text-[11.5px]">
                          <span className="inline-flex items-center gap-1 text-muted"><FileCheck2 size={11} className="text-primary" /> {l.count} {t("policies")}</span>
                          <span className="tnum font-medium text-ink">{fmt(l.premium)} {t("sar")}</span>
                        </div>
                      ) : <div className="mt-1 text-[11px] text-subtle">{t("noProduction")}</div>}
                    </div>
                    {canCreateRequest ? <Link href={`/tenant/requests/new?line=${l.code}`} title={t("newRequest")} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line text-primary hover:bg-primary/5"><Plus size={14} /></Link> : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
