"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

interface TLEvent { at: string; actor: string; phase: string; action: string; label: string }

// أطوار الرحلة بألوانها (يقابل PHASE في LifecycleService)
const PHASE_META: Record<string, { key: string; dot: string; chip: string }> = {
  crm: { key: "crm", dot: "bg-info", chip: "bg-info-soft text-info" },
  request: { key: "request", dot: "bg-primary", chip: "bg-primary-soft text-primary-strong" },
  underwriting: { key: "underwriting", dot: "bg-warning", chip: "bg-warning-soft text-warning" },
  issuance: { key: "issuance", dot: "bg-success", chip: "bg-success-soft text-success" },
  finance: { key: "finance", dot: "bg-ink", chip: "bg-surface-2 text-ink" },
  service: { key: "service", dot: "bg-info", chip: "bg-info-soft text-info" },
  other: { key: "other", dot: "bg-subtle", chip: "bg-surface-2 text-subtle" },
};
const dtm = (s: string) => new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * سجلّ رحلة الكيان: يعرض المسار الكامل (فرصة CRM ⇐ طلب ⇐ تسعير ⇐ إصدار ⇐ مالية) —
 * كل حدث بوقته الدقيق واسم منفِّذه وطوره الملوّن. يجلب من `path` (endpoint الخطّ الزمني).
 */
export function LifecycleTimeline({ path }: { path: string }) {
  const t = useTranslations("timeline");
  const [events, setEvents] = useState<TLEvent[] | null>(null);
  useEffect(() => {
    let alive = true;
    void api<{ events: TLEvent[] }>(path).then((r) => { if (alive) setEvents(r.events); }).catch(() => { if (alive) setEvents([]); });
    return () => { alive = false; };
  }, [path]);

  if (events === null) return <div className="py-8 text-center text-[12.5px] text-subtle">…</div>;
  if (events.length === 0) return <p className="rounded-card border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-subtle">{t("empty")}</p>;

  return (
    <ol className="relative space-y-0 ps-4">
      <span className="absolute inset-y-1 start-[6px] w-px bg-line" aria-hidden />
      {events.map((e, i) => {
        const ph = PHASE_META[e.phase] ?? PHASE_META.other;
        return (
          <li key={i} className="relative flex items-start gap-3 py-2">
            <span className={`absolute -start-[calc(1rem-2px)] mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-bg ${ph.dot}`} aria-hidden />
            <div className="min-w-0 flex-1 rounded-card border border-line bg-card px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ph.chip}`}>{t(`phase.${ph.key}`)}</span>
                <span className="text-[12.5px] font-medium text-ink">{e.label}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-subtle">
                <span className="tnum">{dtm(e.at)}</span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1"><Clock size={11} /> {e.actor}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
