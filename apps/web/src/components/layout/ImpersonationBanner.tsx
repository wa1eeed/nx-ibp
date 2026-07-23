"use client";

import { useEffect, useState } from "react";
import { UserCog, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, getToken, clearToken } from "@/lib/api";

interface Impersonation { tenantId: string; tenantName: string; adminEmail: string | null }

/**
 * بانر جلسة الانتحال — يظهر دائمًا حين يدخل سوبر أدمن المنصّة «كالحساب».
 * لونٌ مميّز (بنفسجي) يفرّقه عن شريط حالة الوصول، مع «العودة للوحة المنصّة»:
 * حذف توكن الانتحال (رمز السوبر أدمن محفوظ بمفتاح منفصل) والرجوع لصفحة المستأجر في اللوحة.
 */
export function ImpersonationBanner() {
  const t = useTranslations("impersonation");
  const [imp, setImp] = useState<Impersonation | null>(null);
  useEffect(() => {
    if (!getToken()) return;
    void api<{ impersonation?: Impersonation | null }>("/auth/me").then((m) => setImp(m.impersonation ?? null)).catch(() => undefined);
  }, []);
  if (!imp) return null;

  const back = () => {
    clearToken(); // يحذف توكن الانتحال فقط — رمز السوبر أدمن (ibp_platform_token) باقٍ
    window.location.href = `/ar/admin/tenants/${imp.tenantId}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[#6d28d9]/30 bg-[#6d28d9]/10 px-4 py-2 text-[12.5px] font-medium text-[#6d28d9] sm:px-7 dark:text-[#c4b5fd]">
      <UserCog size={15} className="shrink-0" />
      <span className="flex-1 min-w-0">{t("banner", { company: imp.tenantName })}</span>
      <button onClick={back} className="inline-flex items-center gap-1 rounded-lg bg-current/10 px-2.5 py-1 text-[12px] font-semibold hover:bg-current/20">
        {t("back")} <ArrowLeft size={13} className="rtl:rotate-180" />
      </button>
    </div>
  );
}
