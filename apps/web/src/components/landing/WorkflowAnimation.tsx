"use client";

import { FileText, ClipboardCheck, Calculator, FileCheck2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

const STAGES = [
  { key: "request", Icon: FileText },
  { key: "underwriting", Icon: ClipboardCheck },
  { key: "quote", Icon: Calculator },
  { key: "issue", Icon: FileCheck2 },
  { key: "verify", Icon: ShieldCheck },
] as const;
const CYCLE = 6; // ثوانٍ لدورة كاملة

/**
 * أنيميشن سير المعاملة — مصمَّم بالكود (CSS keyframes): إشارة تنتقل عبر مراحل دورة حياة الوثيقة
 * (طلب ⇐ اكتتاب ⇐ تسعير ⇐ إصدار ⇐ تحقّق) بتوهّج متتابع + مسار متحرّك + علامة تحقّق مرسومة.
 * يحترم RTL (ترتيب flex ينعكس تلقائيًا فتتبع الإشارة اتجاه القراءة) و prefers-reduced-motion.
 */
export function WorkflowAnimation() {
  const t = useTranslations("landing.workflow");
  return (
    <div className="relative mx-auto max-w-3xl rounded-2xl border border-line bg-card/70 p-6 shadow-card backdrop-blur sm:p-8">
      <div className="relative flex items-start justify-between gap-1.5">
        {/* المسار المتوهّج المتحرّك خلف العُقَد */}
        <div
          className="pointer-events-none absolute inset-x-8 top-6 h-[3px] -translate-y-1/2 rounded-full opacity-70"
          style={{ background: "linear-gradient(90deg, transparent, rgb(16 127 109) 45%, rgb(16 127 109) 55%, transparent)", backgroundSize: "300% 100%", animation: `wf-track ${CYCLE}s linear infinite` }}
        />
        {STAGES.map((s, i) => {
          const delay = `${(i * CYCLE) / STAGES.length}s`;
          return (
            <div key={s.key} className="relative z-10 flex flex-1 flex-col items-center gap-2 text-center">
              <div
                className="grid h-12 w-12 place-items-center rounded-full border border-primary/30 bg-card text-primary"
                style={{ animation: `wf-ring ${CYCLE}s ease-in-out infinite`, animationDelay: delay }}
              >
                <span style={{ display: "grid", animation: `wf-flow ${CYCLE}s ease-in-out infinite`, animationDelay: delay }}>
                  {s.key === "verify" ? <VerifyMark /> : <s.Icon size={21} />}
                </span>
              </div>
              <span className="text-[11px] font-semibold leading-tight text-ink sm:text-[11.5px]">{t(`stages.${s.key}`)}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-center text-[12.5px] leading-relaxed text-subtle">{t("caption")}</p>
    </div>
  );
}

/** علامة تحقّق ZATCA تُرسَم دوريًا (stroke-dashoffset). */
function VerifyMark() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" opacity="0.25" />
      <path d="M7 12.5l3.2 3.2L17 8.8" style={{ strokeDasharray: 22, strokeDashoffset: 22, animation: `wf-check ${6}s ease-in-out infinite`, animationDelay: `${(4 * 6) / 5}s` }} />
    </svg>
  );
}
