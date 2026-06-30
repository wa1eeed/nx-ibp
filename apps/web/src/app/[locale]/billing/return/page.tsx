"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api } from "@/lib/api";

type State = "verifying" | "success" | "pending" | "failed";

/** صفحة العودة بعد الدفع — تطابق حالة الفاتورة (confirm) وتعرض النتيجة. */
export default function BillingReturnPage() {
  const t = useTranslations("billing.return");
  const [state, setState] = useState<State>("verifying");

  useEffect(() => {
    const invoiceId = new URLSearchParams(window.location.search).get("invoice");
    if (!invoiceId) { setState("failed"); return; }
    api<{ status: string }>(`/billing/${invoiceId}/confirm`, { method: "POST" })
      .then((r) => setState(r.status === "PAID" ? "success" : r.status === "FAILED" || r.status === "DECLINED" ? "failed" : "pending"))
      .catch(() => setState("failed"));
  }, []);

  const icon = {
    verifying: <Loader2 size={40} className="animate-spin text-primary" />,
    success: <CheckCircle2 size={40} className="text-success" />,
    pending: <Clock size={40} className="text-warning" />,
    failed: <XCircle size={40} className="text-danger" />,
  }[state];

  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-7 text-center shadow-card">
        <div className="mb-4 flex justify-center">{icon}</div>
        <p className="text-[14px] font-semibold text-ink">{t(state)}</p>
        {state !== "verifying" ? (
          <div className="mt-6 flex flex-col gap-2">
            <Link href="/tenant/settings/billing" className="inline-flex h-10 items-center justify-center rounded-lg bg-primary-strong text-[13px] font-semibold text-primary-fg hover:bg-primary">{t("backToBilling")}</Link>
            <Link href="/tenant/dashboard" className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-card text-[13px] font-semibold text-ink hover:bg-surface-2">{t("backToDashboard")}</Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
