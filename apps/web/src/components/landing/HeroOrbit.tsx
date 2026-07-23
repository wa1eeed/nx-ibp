"use client";

import { KanbanSquare, Calculator, FileCheck2, Landmark, ClipboardList, ShieldCheck, Users, BadgeCheck, Shield, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * البطل الفلكي — «نظام تشغيل الوساطة» كمنظومة حيّة: نواة مركزية (المنصّة) تدور حولها
 * أقمار الموديولات على حلقتين بسرعتين واتّجاهين متعاكسين، مع حزم بيانات تسري على المدارات،
 * هالة مخروطية تدور، وبطاقات عائمة. كلّه مصمَّم بالكود (CSS keyframes) بلا صور/مكتبات،
 * ومتماثل فيعمل في RTL/LTR، ويحترم prefers-reduced-motion (عبر globals.css).
 */
const RING_A = { r: 66, dur: 26, dir: "cw" as const, sats: [KanbanSquare, Calculator, FileCheck2, Landmark] };
const RING_B = { r: 116, dur: 34, dir: "ccw" as const, sats: [ClipboardList, ShieldCheck, Users, BadgeCheck] };

export function HeroOrbit() {
  const t = useTranslations("landing.workflow");
  return (
    <div className="relative mx-auto grid h-[300px] w-full max-w-xl place-items-center overflow-hidden sm:h-[340px]">
      {/* هالة مخروطية دوّارة خلف النواة */}
      <div
        className="pointer-events-none absolute h-64 w-64 rounded-full opacity-60"
        style={{ background: "conic-gradient(from 0deg, rgba(16,127,109,.28), transparent 25%, rgba(16,127,109,.18) 55%, transparent 80%, rgba(16,127,109,.28))", filter: "blur(26px)", animation: "orbit-cw 14s linear infinite" }}
        aria-hidden
      />

      {/* حلقتان منقّطتان تدوران ببطء */}
      <Ring r={RING_A.r} slow={44} dir="cw" />
      <Ring r={RING_B.r} slow={60} dir="ccw" />

      {/* أقمار الموديولات */}
      <Satellites {...RING_A} />
      <Satellites {...RING_B} />

      {/* حزم بيانات تسري على المدارات */}
      <Packet r={RING_A.r} dur={7} dir="cw" delay={0} />
      <Packet r={RING_A.r} dur={7} dir="cw" delay={-3.5} />
      <Packet r={RING_B.r} dur={9} dir="ccw" delay={-2} />

      {/* النواة المركزية — المنصّة */}
      <div className="relative z-20 grid h-20 w-20 place-items-center rounded-3xl bg-primary-strong text-white" style={{ animation: "core-pulse 3s ease-in-out infinite" }}>
        <Shield size={34} strokeWidth={1.8} />
        <span className="absolute inset-0 rounded-3xl ring-1 ring-white/20" />
      </div>

      {/* بطاقات عائمة */}
      <div className="absolute start-2 top-6 z-30 flex items-center gap-1.5 rounded-full border border-line bg-card/90 px-2.5 py-1 shadow-card backdrop-blur" style={{ animation: "fx-float 5s ease-in-out infinite" }}>
        <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full rounded-full bg-primary/60" style={{ animation: "fx-ticker 1.8s ease-in-out infinite" }} /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary-strong" /></span>
        <span className="text-[10.5px] font-semibold text-primary-strong">{t("live")}</span>
      </div>
      <div className="absolute bottom-7 end-2 z-30 flex items-center gap-1.5 rounded-full border border-line bg-card/90 px-2.5 py-1 shadow-card backdrop-blur" style={{ animation: "fx-float2 6s ease-in-out infinite" }}>
        <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-success text-white"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></span>
        <span className="text-[10.5px] font-bold text-ink">ZATCA</span>
      </div>
    </div>
  );
}

/** حلقة منقّطة تدور ببطء. */
function Ring({ r, slow, dir }: { r: number; slow: number; dir: "cw" | "ccw" }) {
  return (
    <div
      className="pointer-events-none absolute rounded-full border border-dashed border-primary/25"
      style={{ width: r * 2, height: r * 2, animation: `orbit-${dir} ${slow}s linear infinite` }}
      aria-hidden
    />
  );
}

/** أقمار موديولات موزّعة بالتساوي على مدار وتدور حول النواة (مع إبقاء الأيقونات معتدلة). */
function Satellites({ r, dur, dir, sats }: { r: number; dur: number; dir: "cw" | "ccw"; sats: LucideIcon[] }) {
  const counter = dir === "cw" ? "ccw" : "cw";
  return (
    <>
      {sats.map((Icon, i) => {
        const delay = `-${(dur * i) / sats.length}s`;
        return (
          <div key={i} className="pointer-events-none absolute" style={{ width: r * 2, height: r * 2, animation: `orbit-${dir} ${dur}s linear infinite`, animationDelay: delay }} aria-hidden>
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
              <div style={{ animation: `orbit-${counter} ${dur}s linear infinite`, animationDelay: delay }}>
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-primary/20 bg-card text-primary shadow-card">
                  <Icon size={19} />
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

/** حزمة بيانات متوهّجة تسري على مدار. */
function Packet({ r, dur, dir, delay }: { r: number; dur: number; dir: "cw" | "ccw"; delay: number }) {
  return (
    <div className="pointer-events-none absolute" style={{ width: r * 2, height: r * 2, animation: `orbit-${dir} ${dur}s linear infinite`, animationDelay: `${delay}s` }} aria-hidden>
      <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-strong" style={{ boxShadow: "0 0 10px 2px rgba(16,127,109,.7)" }} />
    </div>
  );
}
