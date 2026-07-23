"use client";

import { useCallback, useEffect, useState } from "react";
import { LogIn, LogOut, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, getToken } from "@/lib/api";

interface Today { id: string; checkInAt: string | null; checkOutAt: string | null; source: string } // أو null

/**
 * أداة الحضور والانصراف — على لوحة التحكّم. تصميم ذكي: الحضور يُسجَّل **تلقائيًا عند تسجيل الدخول**
 * (المصدر login)، وهذه الأداة للتسجيل اليدوي الدقيق (Check-in/Check-out) وعرض حالة اليوم.
 */
export function AttendanceWidget() {
  const t = useTranslations("attendance");
  const [today, setToday] = useState<Today | null | undefined>(undefined); // undefined=يحمّل, null=لا سجل
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setToday(await api<Today | null>("/hr/attendance/today")); } catch { setToday(null); }
  }, []);
  useEffect(() => { if (getToken()) void load(); }, [load]);

  const act = async (path: string) => {
    setBusy(true);
    try { setToday(await api<Today>(`/hr/attendance/${path}`, { method: "POST", body: "{}" })); } catch { /* */ } finally { setBusy(false); }
  };

  if (today === undefined) return null;
  const time = (s: string | null) => (s ? new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—");
  const checkedIn = !!today?.checkInAt;
  const checkedOut = !!today?.checkOutAt;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-card px-4 py-3 shadow-card">
      <div className="flex items-center gap-2 text-primary"><Clock size={18} /><span className="text-[13px] font-bold text-ink">{t("title")}</span></div>
      <div className="flex items-center gap-4 text-[12.5px]">
        <span className="text-subtle">{t("in")}: <span className="font-semibold text-ink tnum">{time(today?.checkInAt ?? null)}</span></span>
        <span className="text-subtle">{t("out")}: <span className="font-semibold text-ink tnum">{time(today?.checkOutAt ?? null)}</span></span>
      </div>
      <div className="ms-auto flex items-center gap-2">
        {!checkedIn ? (
          <button onClick={() => void act("check-in")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">
            <LogIn size={15} /> {t("checkIn")}
          </button>
        ) : !checkedOut ? (
          <button onClick={() => void act("check-out")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-60">
            <LogOut size={15} /> {t("checkOut")}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-success-soft px-3 py-1.5 text-[12px] font-semibold text-success">{t("done")}</span>
        )}
      </div>
    </div>
  );
}
