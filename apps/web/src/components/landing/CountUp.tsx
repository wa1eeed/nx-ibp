"use client";

import { useEffect, useRef, useState } from "react";

/**
 * عدّاد يتصاعد من الصفر إلى القيمة الهدف حين يدخل منطقة العرض (رقم يتزايد بانسيابية — easeOutCubic)،
 * بأسلوب إحصاءات صفحات الفنتك. يقفز مباشرةً للقيمة النهائية مع prefers-reduced-motion أو غياب IO.
 */
export function CountUp({ to, suffix = "", prefix = "", duration = 1500 }: { to: number; suffix?: string; prefix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") { setVal(to); return; }

    let raf = 0;
    let start = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        const step = (ts: number) => {
          if (!start) start = ts;
          const p = Math.min(1, (ts - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setVal(Math.round(to * eased));
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, duration]);

  return <span ref={ref} className="tnum">{prefix}{val.toLocaleString("en-US")}{suffix}</span>;
}
