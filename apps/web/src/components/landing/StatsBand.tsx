"use client";

import { Layers, LayoutGrid, BadgeCheck, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { CountUp } from "./CountUp";
import { Reveal } from "./Reveal";

// أرقام حقيقية للمنصّة (لا مبالغة): ١٠ فروع تأمين رئيسية · ٤٧ منتَجًا في الكتالوج ·
// ٣٣ شاشة/موديولًا متكاملًا · ١٠٠٪ توافق فوترة ZATCA (المرحلة الثانية).
const STATS = [
  { key: "lines", to: 47, suffix: "", Icon: Layers },
  { key: "modules", to: 33, suffix: "", Icon: LayoutGrid },
  { key: "zatca", to: 100, suffix: "٪", Icon: BadgeCheck },
  { key: "compliance", to: 4, suffix: "", Icon: ShieldCheck },
] as const;

/** شريط إحصاءات المنصّة — أرقام تتصاعد عند التمرير (بأسلوب صفحات الفنتك). */
export function StatsBand() {
  const t = useTranslations("landing.stats");
  return (
    <section className="border-y border-line bg-card/50">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden px-5 py-2 sm:grid-cols-4">
        {STATS.map((s, i) => (
          <Reveal key={s.key} delay={i * 90}>
            <div className="flex flex-col items-center gap-1.5 px-3 py-7 text-center">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"><s.Icon size={18} /></span>
              <div className="text-[30px] font-bold leading-none text-ink sm:text-[34px]">
                <CountUp to={s.to} suffix={s.suffix} />
              </div>
              <div className="text-[12.5px] font-medium leading-tight text-muted">{t(s.key)}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
