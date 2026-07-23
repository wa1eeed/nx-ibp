"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Ban, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, getToken } from "@/lib/api";
import { Link } from "@/i18n/routing";

interface Access { state: string; daysLeft: number | null; trialEndsAt: string | null }

/**
 * شريط تنبيه دائم لحالة الحساب — يجعل الحجب متوقَّعًا لا مفاجئًا:
 *  - تجربة سارية (≤7 أيام): عدّاد كهرماني «تنتهي بعد N يوم — جدّد».
 *  - انتهت التجربة: أحمر «انتهت — بياناتك محفوظة، جدّد للمتابعة».
 *  - موقوف: أحمر «الحساب موقوف — تواصل مع الدعم».
 */
export function AccessBanner() {
  const t = useTranslations("access");
  const [acc, setAcc] = useState<Access | null>(null);
  useEffect(() => {
    if (!getToken()) return;
    void api<{ access?: Access }>("/auth/me").then((m) => setAcc(m.access ?? null)).catch(() => undefined);
  }, []);
  if (!acc) return null;

  const trialSoon = acc.state === "trial" && acc.daysLeft != null && acc.daysLeft <= 7;
  const expired = acc.state === "trial_expired";
  const suspended = acc.state === "suspended" || acc.state === "cancelled";
  if (!trialSoon && !expired && !suspended) return null;

  const tone = suspended || expired ? "bg-danger/10 text-danger border-danger/30" : "bg-warning/10 text-warning border-warning/30";
  const Icon = suspended ? Ban : expired ? AlertTriangle : Clock;
  const msg = suspended
    ? t(acc.state === "cancelled" ? "cancelled" : "suspended")
    : expired
      ? t("expired")
      : t("trialSoon", { days: acc.daysLeft ?? 0 });

  return (
    <div className={`flex flex-wrap items-center gap-2 border-b px-4 py-2 text-[12.5px] font-medium sm:px-7 ${tone}`}>
      <Icon size={15} className="shrink-0" />
      <span className="flex-1 min-w-0">{msg}</span>
      {!suspended ? (
        <Link href="/tenant/settings/billing" className="inline-flex items-center gap-1 rounded-lg bg-current/10 px-2.5 py-1 text-[12px] font-semibold hover:bg-current/20">
          {t("renew")} <ArrowLeft size={13} className="rtl:rotate-180" />
        </Link>
      ) : null}
    </div>
  );
}
