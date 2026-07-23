"use client";

/**
 * رسوم توضيحية متحرّكة مصمَّمة بالكود (CSS keyframes) لكل ميزة — بلا صور خارجية.
 * تحترم prefers-reduced-motion (تُعطَّل عبر globals.css).
 */
export function FeatureViz({ variant }: { variant: "cards" | "flow" | "bars" | "count" | "scan" | "calendar" }) {
  return (
    <div className="relative grid h-28 w-full place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary-soft/60 to-surface-2/40">
      {variant === "cards" ? <VizCards /> : null}
      {variant === "flow" ? <VizFlow /> : null}
      {variant === "bars" ? <VizBars /> : null}
      {variant === "count" ? <VizCount /> : null}
      {variant === "scan" ? <VizScan /> : null}
      {variant === "calendar" ? <VizCalendar /> : null}
      {/* لمعان دوريّ يعبر الصندوق (لمسة فنتك) */}
      <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent" style={{ animation: "fx-sweep 4.5s ease-in-out infinite" }} aria-hidden />
    </div>
  );
}

/** CRM — بطاقات كانبان تنتقل بين الأعمدة. */
function VizCards() {
  return (
    <div className="flex items-end gap-2">
      {[0, 1, 2].map((c) => (
        <div key={c} className="flex w-12 flex-col gap-1 rounded-lg bg-card/70 p-1.5 ring-1 ring-line">
          {[0, 1].map((r) => (
            <div key={r} className="h-2.5 rounded bg-primary/40" style={{ animation: "fx-pulse 2.4s ease-in-out infinite", animationDelay: `${(c * 2 + r) * 0.25}s` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** سير المعاملة — نقاط تتحرّك على مسار. */
function VizFlow() {
  return (
    <div className="relative flex w-4/5 items-center justify-between">
      <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-primary/25" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="relative z-10 h-3.5 w-3.5 rounded-full border-2 border-primary bg-card" style={{ animation: "fx-pulse 2.6s ease-in-out infinite", animationDelay: `${i * 0.4}s` }} />
      ))}
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full opacity-70" style={{ background: "linear-gradient(90deg,transparent,rgb(16 127 109),transparent)", backgroundSize: "300% 100%", animation: "wf-track 2.6s linear infinite" }} />
    </div>
  );
}

/** المالية/التقارير — أعمدة ترتفع. */
function VizBars() {
  const H = [40, 68, 52, 84, 60];
  return (
    <div className="flex h-16 items-end gap-1.5">
      {H.map((h, i) => (
        <div key={i} className="w-3.5 rounded-t bg-primary/70" style={{ height: `${h}%`, transformOrigin: "bottom", animation: "fx-bar 1.8s ease-in-out infinite alternate", animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

/** العمولات — نسبة تنبض. */
function VizCount() {
  return (
    <div className="flex items-baseline gap-1 text-primary-strong">
      <span className="text-[34px] font-bold tnum" style={{ animation: "fx-count 1.6s ease-in-out infinite alternate" }}>٪</span>
      <div className="ms-1 h-9 w-9 rounded-full border-4 border-primary/25 border-t-primary" style={{ animation: "fx-spin 2.2s linear infinite" }} />
    </div>
  );
}

/** التحقّق/الامتثال/ZATCA — مسح وثيقة + علامة صحّة. */
function VizScan() {
  return (
    <div className="relative h-16 w-12 overflow-hidden rounded-md bg-card ring-1 ring-line">
      <div className="space-y-1.5 p-2">
        {[10, 8, 9, 6].map((w, i) => <div key={i} className="h-1 rounded bg-line" style={{ width: `${w * 8}%` }} />)}
      </div>
      <div className="pointer-events-none absolute inset-x-0 h-6 bg-gradient-to-b from-primary/40 to-transparent" style={{ animation: "fx-scan 2.4s ease-in-out infinite" }} />
      <svg className="absolute bottom-1 end-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(16 127 109)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" style={{ strokeDasharray: 26, strokeDashoffset: 26, animation: "fx-draw 2.4s ease-in-out infinite" }} />
      </svg>
    </div>
  );
}

/** الموارد البشرية — تقويم بخلايا تنبض + علامة. */
function VizCalendar() {
  return (
    <div className="grid grid-cols-5 gap-1">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="h-3.5 w-3.5 rounded-[3px]" style={{ background: i % 4 === 0 ? "rgb(16 127 109)" : "var(--surface-2, #e5eaed)", animation: "fx-pulse 3s ease-in-out infinite", animationDelay: `${(i % 5) * 0.2}s` }} />
      ))}
    </div>
  );
}
