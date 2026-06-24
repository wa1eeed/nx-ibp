"use client";

import { useEffect, useState } from "react";
import { Plug, CheckCircle2, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";

interface Connector { key: string; name: string; category: string; environment: string; status: string; note: string }
interface Status { environment: string; dataResidency: string; connectors: Connector[]; summary: { total: number; active: number; planned: number } }

export default function IntegrationsPage() {
  const t = useTranslations();
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => { void api<Status>("/regulatory/status").then(setS).catch(() => undefined); }, []);

  return (
    <div className="space-y-5">
      <PageHeader title={t("integrations.title")} subtitle={t("integrations.subtitle")} />

      <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-card px-5 py-3 text-[12.5px] shadow-card">
        <Badge tone="warning">{t("integrations.sandbox")}</Badge>
        <span className="text-muted">{t("integrations.residencyNote")}</span>
        {s ? <span className="ms-auto text-subtle tnum">{s.summary.active}/{s.summary.total} {t("integrations.active")}</span> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {s?.connectors.map((c) => (
          <div key={c.key} className="flex flex-col rounded-card border border-line bg-card p-4 shadow-card">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"><Plug size={17} /></div>
              <Badge tone={c.status === "active" ? "success" : "neutral"}>
                {c.status === "active" ? <CheckCircle2 size={12} /> : <Clock size={12} />} {t(`integrations.status.${c.status}`)}
              </Badge>
            </div>
            <div className="text-[13.5px] font-semibold text-ink">{c.name}</div>
            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-subtle">{t(`integrations.cat.${c.category}`)}</div>
            <p className="mt-2 text-[12px] text-muted">{c.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
