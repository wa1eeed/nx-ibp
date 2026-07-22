"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

export interface TLEvent { at: string; phase: string; label: string; actor?: string | null; ref?: string | null }

// أطوار الرحلة بألوانها (يقابل audit-describe في الخلفية)
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
 * سجلّ رحلة/نشاط موحّد — خطّ زمني عمودي احترافي بعُقَد ملوّنة حسب الطور، مع الوصف والمنفِّذ والوقت.
 * يحترم RTL/LTR (خصائص منطقية `ps`/`start`). يقبل إمّا `path` (يجلب من endpoint) أو `events` جاهزة.
 * `descending` لعرض الأحدث أولًا (نشاط الموظف)، والافتراضي تصاعدي (رحلة من أول إجراء).
 */
export function LifecycleTimeline({ path, events: eventsProp, descending = false }: { path?: string; events?: TLEvent[]; descending?: boolean }) {
  const t = useTranslations("timeline");
  const [fetched, setFetched] = useState<TLEvent[] | null>(eventsProp ? null : null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    void api<{ events: TLEvent[] }>(path).then((r) => { if (alive) setFetched(r.events); }).catch(() => { if (alive) setFetched([]); });
    return () => { alive = false; };
  }, [path]);

  const events = eventsProp ?? fetched;
  if (events === null) return <div className="py-8 text-center text-[12.5px] text-subtle">…</div>;
  if (events.length === 0) return <p className="rounded-card border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-subtle">{t("empty")}</p>;
  const ordered = descending ? [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()) : events;

  return (
    <ol className="relative space-y-0 ps-4">
      <span className="absolute inset-y-1 start-[6px] w-px bg-line" aria-hidden />
      {ordered.map((e, i) => {
        const ph = PHASE_META[e.phase] ?? PHASE_META.other;
        return (
          <li key={i} className="relative flex items-start gap-3 py-1.5">
            <span className={`absolute -start-[calc(1rem-2px)] mt-2 h-2.5 w-2.5 rounded-full ring-2 ring-bg ${ph.dot}`} aria-hidden />
            <div className="min-w-0 flex-1 rounded-card border border-line bg-card px-3 py-2 shadow-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ph.chip}`}>{t(`phase.${ph.key}`)}</span>
                <span className="text-[12.5px] font-medium text-ink">{e.label}</span>
                {e.ref ? <span className="text-[11px] text-subtle tnum">· {e.ref}</span> : null}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-subtle">
                <span className="tnum">{dtm(e.at)}</span>
                {e.actor ? <><span aria-hidden>·</span><span className="inline-flex items-center gap-1"><Clock size={11} /> {e.actor}</span></> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
