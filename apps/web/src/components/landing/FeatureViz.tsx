"use client";

import type { CSSProperties } from "react";

/** style مع خصائص CSS مخصّصة (متغيّرات --*) بأمان نوعيّ. */
const sx = (o: Record<string, string | number>): CSSProperties => o as CSSProperties;

/**
 * رسوم توضيحية متحرّكة مصمَّمة بالكود (CSS keyframes) — لكل ميزة أنيميشن **فريد** يعبّر عن وظيفتها،
 * بلا صور أو مكتبات خارجية. تحترم prefers-reduced-motion (تُعطَّل عبر globals.css) وRTL.
 */
export type VizVariant =
  | "crm" | "quotes" | "policy" | "ledger" | "donut" | "claim"
  | "hr" | "aml" | "fingerprint" | "chart" | "qr" | "tenants";

const MAP: Record<VizVariant, () => JSX.Element> = {
  crm: VizCrm,
  quotes: VizQuotes,
  policy: VizPolicy,
  ledger: VizLedger,
  donut: VizDonut,
  claim: VizClaim,
  hr: VizHr,
  aml: VizAml,
  fingerprint: VizFingerprint,
  chart: VizChart,
  qr: VizQr,
  tenants: VizTenants,
};

export function FeatureViz({ variant }: { variant: VizVariant }) {
  const Viz = MAP[variant] ?? VizChart;
  return (
    <div className="relative grid h-28 w-full place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary-soft/60 to-surface-2/40">
      <Viz />
      {/* لمعان دوريّ يعبر الصندوق (لمسة فنتك موحّدة) */}
      <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent" style={{ animation: "fx-sweep 4.5s ease-in-out infinite" }} aria-hidden />
    </div>
  );
}

const TEAL = "rgb(16 127 109)";

/** CRM — قمع صفقات: بطاقة تنتقل بين ثلاثة أعمدة وتُتوَّج «مكسوبة». */
function VizCrm() {
  return (
    <div className="relative flex items-end gap-2.5">
      {["", "", ""].map((_, c) => (
        <div key={c} className="flex h-16 w-11 flex-col gap-1 rounded-lg bg-card/70 p-1.5 ring-1 ring-line">
          <div className="h-1 w-6 rounded bg-line" />
          {c === 0 ? <div className="h-3 rounded bg-primary/50" style={sx({ animation: "fv-slot 4s ease-in-out infinite", "--dir": "1" })} /> : <div className="h-3 rounded bg-primary/15" />}
        </div>
      ))}
      {/* وسم الفوز */}
      <span className="absolute -top-1 end-0 grid h-5 w-5 place-items-center rounded-full bg-success text-white shadow" style={{ animation: "fv-win 4s ease-in-out infinite" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      </span>
    </div>
  );
}

/** الاكتتاب/طلبات التسعير — طلب مركزي يشعّ لعدّة شركات ثم عروض تتنافس وأفضلها يُبرَز. */
function VizQuotes() {
  const H = [46, 72, 58, 90];
  return (
    <div className="flex h-16 items-end gap-1.5">
      {H.map((h, i) => {
        const best = i === 3;
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className={`w-3.5 rounded-t ${best ? "bg-success" : "bg-primary/55"}`} style={{ height: `${h}%`, transformOrigin: "bottom", animation: "fx-bar 1.9s ease-in-out infinite alternate", animationDelay: `${i * 0.16}s` }} />
            {best ? <span className="grid h-3 w-3 place-items-center rounded-full bg-success text-white" style={{ animation: "fv-win 3.2s ease-in-out infinite" }}><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg></span> : <span className="h-3 w-3" />}
          </div>
        );
      })}
    </div>
  );
}

/** إصدار الوثائق والملاحق — وثيقة يهبط عليها ختم رسميّ ثم يُضاف سطر ملحق. */
function VizPolicy() {
  return (
    <div className="relative h-16 w-14 rounded-md bg-card ring-1 ring-line">
      <div className="space-y-1.5 p-2">
        {[10, 7, 9].map((w, i) => <div key={i} className="h-1 rounded bg-line" style={{ width: `${w * 9}%` }} />)}
        {/* سطر الملحق يُضاف */}
        <div className="h-1 origin-right rounded bg-primary/60" style={{ width: "70%", animation: "fv-line 3.6s ease-in-out infinite" }} />
      </div>
      {/* ختم رسميّ يهبط */}
      <span className="absolute inset-0 grid place-items-center" style={{ animation: "fv-stamp 3.6s ease-in-out infinite" }}>
        <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-primary/70 text-primary" style={{ boxShadow: "inset 0 0 0 2px rgba(16,127,109,.18)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </span>
      </span>
    </div>
  );
}

/** المالية والمحاسبة — قيد مزدوج: مدين/دائن يتوازنان مع ميزان يستقرّ. */
function VizLedger() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-end gap-6">
        <div className="flex flex-col items-center gap-1">
          <div className="w-8 rounded-t bg-primary/60" style={{ height: 30, transformOrigin: "bottom", animation: "fx-bar 2.2s ease-in-out infinite alternate" }} />
          <span className="text-[9px] font-bold text-muted">مدين</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-8 rounded-t bg-primary-strong/70" style={{ height: 30, transformOrigin: "bottom", animation: "fx-bar 2.2s ease-in-out infinite alternate", animationDelay: "0.15s" }} />
          <span className="text-[9px] font-bold text-muted">دائن</span>
        </div>
      </div>
      <div className="h-[3px] w-24 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" style={{ backgroundSize: "300% 100%", animation: "wf-track 2.6s linear infinite" }} />
    </div>
  );
}

/** العمولات — حلقة نسبة تمتلئ (SVG) ثم تتوزّع للوسطاء الفرعيين. */
function VizDonut() {
  return (
    <div className="relative grid h-20 w-20 place-items-center">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r="27" fill="none" stroke="rgba(16,127,109,.16)" strokeWidth="8" />
        <circle cx="40" cy="40" r="27" fill="none" stroke={TEAL} strokeWidth="8" strokeLinecap="round" strokeDasharray="170" style={sx({ "--circ": "170", "--fill": "54", animation: "fv-ring 3s ease-in-out infinite" })} />
      </svg>
      <span className="absolute text-[15px] font-bold text-primary-strong">٪</span>
    </div>
  );
}

/** المطالبات وخدمة العملاء — متتبّع حالة (فتح ⇐ مراجعة ⇐ اعتماد) يتقدّم وعلامة تُختم. */
function VizClaim() {
  return (
    <div className="flex w-4/5 items-center">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-1 items-center">
          <span className="grid h-6 w-6 place-items-center rounded-full text-white" style={sx({ animation: "fv-step 3.3s ease-in-out infinite", animationDelay: `${i * 0.5}s`, "--off": "#cfd8dc" })}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </span>
          {i < 2 ? <span className="h-[3px] flex-1 rounded-full bg-primary/25" style={{ backgroundSize: "300% 100%", background: "linear-gradient(90deg,transparent,rgb(16 127 109),transparent)", animation: "wf-track 3.3s linear infinite", animationDelay: `${i * 0.5}s` }} /> : null}
        </div>
      ))}
    </div>
  );
}

/** الموارد البشرية والرواتب — شبكة حضور تمتلئ + قسيمة راتب تهبط. */
function VizHr() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid grid-cols-4 gap-1">
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className="h-3 w-3 rounded-[3px] bg-primary/70" style={{ animation: "fv-cell 2.8s ease-in-out infinite", animationDelay: `${(i % 6) * 0.18}s` }} />
        ))}
      </div>
      <div className="flex h-14 w-10 flex-col gap-1 rounded-md bg-card p-1.5 ring-1 ring-line" style={{ animation: "fv-drop 3.2s ease-in-out infinite" }}>
        <div className="h-1 w-full rounded bg-line" />
        <div className="h-1 w-2/3 rounded bg-line" />
        <div className="mt-auto h-2 w-full rounded bg-success/70" />
      </div>
    </div>
  );
}

/** الامتثال ومكافحة غسل الأموال — رادار يمسح + ومضات + مؤشّر خطر يستقرّ. */
function VizAml() {
  return (
    <div className="flex items-center gap-4">
      <div className="relative grid h-16 w-16 place-items-center rounded-full ring-1 ring-primary/25">
        <span className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg, rgba(16,127,109,.35), transparent 60%)", animation: "orbit-cw 2.6s linear infinite" }} />
        <span className="absolute h-full w-px bg-primary/20" />
        <span className="absolute h-px w-full bg-primary/20" />
        {[[18, 22], [40, 48], [50, 26]].map(([x, y], i) => (
          <span key={i} className="absolute h-2 w-2 rounded-full bg-primary-strong" style={{ left: x, top: y, animation: "fv-blip 2.6s ease-out infinite", animationDelay: `${i * 0.7}s` }} />
        ))}
      </div>
      {/* مؤشّر الخطر */}
      <div className="relative h-8 w-16 overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 h-8 rounded-t-full border-2 border-b-0 border-line" />
        <div className="absolute bottom-0 left-1/2 h-7 w-[2px] origin-bottom -translate-x-1/2 rounded bg-danger" style={{ animation: "fv-gauge 3.4s ease-in-out infinite" }} />
      </div>
    </div>
  );
}

/** التحقّق الحكومي — بصمة تُمسَح ضوئيًّا ثم علامة تحقّق (biometric scan). */
function VizFingerprint() {
  return (
    <div className="relative grid h-16 w-14 place-items-center overflow-hidden rounded-lg bg-card ring-1 ring-line">
      <svg width="34" height="40" viewBox="0 0 34 40" fill="none" stroke={TEAL} strokeWidth="1.6" strokeLinecap="round" style={{ animation: "fv-fp 2s ease-in-out infinite" }}>
        <path d="M17 6c-6 0-10 4-10 10v6" />
        <path d="M17 10c-4 0-7 3-7 7v8" />
        <path d="M17 14c-2.5 0-4 1.8-4 4v10" />
        <path d="M17 18v11" />
        <path d="M21 12c3 2 4 5 4 9v4" />
        <path d="M27 15c1.6 2 2 4 2 7" />
      </svg>
      {/* خط المسح */}
      <span className="pointer-events-none absolute inset-x-1 top-0 h-6 bg-gradient-to-b from-primary/45 to-transparent" style={{ animation: "fv-scanline 2s ease-in-out infinite" }} />
      {/* علامة تحقّق */}
      <span className="absolute bottom-1 end-1 grid h-4 w-4 place-items-center rounded-full bg-success text-white">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" style={{ strokeDasharray: 26, strokeDashoffset: 26, animation: "fx-draw 2s ease-in-out infinite" }} /></svg>
      </span>
    </div>
  );
}

/** التقارير والتحليلات — مخطّط مركّب: أعمدة + خطّ اتجاه يُرسَم + نقطة ذروة. */
function VizChart() {
  const H = [38, 55, 44, 68, 80];
  return (
    <div className="relative h-16 w-24">
      <div className="flex h-full items-end gap-2">
        {H.map((h, i) => <div key={i} className="flex-1 rounded-t bg-primary/35" style={{ height: `${h}%`, transformOrigin: "bottom", animation: "fx-bar 2s ease-in-out infinite alternate", animationDelay: `${i * 0.12}s` }} />)}
      </div>
      <svg className="pointer-events-none absolute inset-0" viewBox="0 0 96 64" fill="none" preserveAspectRatio="none">
        <path d="M6 44 L29 34 L48 40 L67 22 L90 10" stroke={TEAL} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 130, strokeDashoffset: 130, animation: "fv-trend 3s ease-in-out infinite" }} />
        <circle cx="90" cy="10" r="3.4" fill={TEAL} style={{ animation: "fx-pulse 2s ease-in-out infinite" }} />
      </svg>
    </div>
  );
}

/** الفوترة الإلكترونية ZATCA — رمز QR يُبنى وحدةً وحدة ثم ختم موقّع. */
function VizQr() {
  const cells = [1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0]; // نمط ثابت
  return (
    <div className="relative grid h-16 w-16 grid-cols-4 grid-rows-4 gap-0.5 rounded-md bg-card p-1.5 ring-1 ring-line">
      {cells.map((on, i) => (
        <span key={i} className="rounded-[2px]" style={{ background: on ? "rgb(15 23 42)" : "transparent", animation: on ? "fv-qr 3s ease-in-out infinite" : "none", animationDelay: `${(i % 8) * 0.12}s` }} />
      ))}
      <span className="absolute -bottom-1 -end-1 grid h-5 w-5 place-items-center rounded-full bg-primary-strong text-white shadow" style={{ animation: "fv-win 3s ease-in-out infinite" }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      </span>
    </div>
  );
}

/** تعدّد المستأجرين والحوكمة — شبكة حاويات معزولة تُضيء مستقلّةً حول درع مركزي. */
function VizTenants() {
  return (
    <div className="relative grid h-20 w-20 place-items-center">
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 9 }).map((_, i) => {
          const center = i === 4;
          return center ? (
            <span key={i} className="grid h-5 w-5 place-items-center rounded-md bg-primary-strong text-white" style={{ animation: "core-pulse 2.6s ease-in-out infinite" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" /></svg>
            </span>
          ) : (
            <span key={i} className="h-5 w-5 rounded-md ring-1 ring-primary/40 bg-primary/40" style={{ animation: "fv-cell 3s ease-in-out infinite", animationDelay: `${(i % 5) * 0.24}s` }} />
          );
        })}
      </div>
    </div>
  );
}
