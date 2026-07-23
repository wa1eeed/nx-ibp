"use client";

import { Sparkles, KanbanSquare, Calculator, ClipboardList, Landmark, ShieldAlert, Users } from "lucide-react";
import { useTranslations } from "next-intl";

const AGENTS = [
  { key: "crm", Icon: KanbanSquare },
  { key: "pricing", Icon: Calculator },
  { key: "claims", Icon: ClipboardList },
  { key: "finance", Icon: Landmark },
  { key: "compliance", Icon: ShieldAlert },
  { key: "hr", Icon: Users },
] as const;

/**
 * قسم وكلاء الذكاء الاصطناعي — كل موديول يُعزَّز بوكيل ذكاء اصطناعي. بطاقات بتوهّج ناعم مصمَّم بالكود.
 */
export function AiAgentsSection() {
  const t = useTranslations("landing.ai");
  return (
    <section className="relative overflow-hidden border-y border-line bg-ink text-white">
      {/* هالة متوهّجة خلفية (مصمَّمة بالكود) */}
      <div className="pointer-events-none absolute -top-24 start-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/30 blur-3xl" style={{ animation: "fx-pulse 5s ease-in-out infinite" }} />
      <div className="relative mx-auto max-w-6xl px-5 py-14">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[12.5px] font-medium text-white/90 ring-1 ring-white/15">
            <Sparkles size={14} style={{ animation: "fx-pulse 3s ease-in-out infinite" }} /> {t("badge")}
          </span>
          <h2 className="mx-auto mt-4 max-w-2xl text-[26px] font-bold tracking-tight">{t("title")}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-relaxed text-white/70">{t("subtitle")}</p>
        </div>
        <div className="mt-9 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((a, i) => (
            <div
              key={a.key}
              className="group relative overflow-hidden rounded-card border border-white/10 bg-white/[0.04] p-5 ring-1 ring-white/5 transition-colors hover:bg-white/[0.07]"
              style={{ animation: "fx-rise .6s ease-out both", animationDelay: `${i * 0.08}s` }}
            >
              {/* ومضة تمرّ عبر البطاقة */}
              <div className="pointer-events-none absolute inset-y-0 -inset-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100" style={{ animation: "fx-sweep 2.2s ease-in-out infinite" }} />
              <div className="relative flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary-fg ring-1 ring-primary/30"><a.Icon size={19} /></div>
                <div>
                  <h3 className="text-[14.5px] font-bold">{t(`agents.${a.key}.name`)}</h3>
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-primary-fg/80">{t("soon")}</span>
                </div>
              </div>
              <p className="relative mt-2.5 text-[12.5px] leading-relaxed text-white/70">{t(`agents.${a.key}.desc`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
