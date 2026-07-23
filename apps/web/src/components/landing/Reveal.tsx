"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * كشف عند التمرير — يظهر المحتوى بانزلاق/تلاشٍ لطيف عند دخوله منطقة العرض (IntersectionObserver)،
 * بأسلوب صفحات الفنتك الحديثة. يحترم prefers-reduced-motion (عبر globals.css) ويظهر فورًا حين
 * لا يتوفّر IntersectionObserver. `delay` يتيح ترتيبًا متتابعًا (stagger) للعناصر المتجاورة.
 */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) { setShown(true); io.disconnect(); break; } },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal${shown ? " in" : ""} ${className}`.trim()} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
