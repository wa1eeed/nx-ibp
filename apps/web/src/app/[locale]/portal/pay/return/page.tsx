"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Clock, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { cpapi } from "@/lib/api";

function PayReturnInner() {
  const t = useTranslations("portal.pay");
  const params = useSearchParams();
  const paymentId = params.get("payment") ?? "";
  const [status, setStatus] = useState<"loading" | "PAID" | "PENDING" | "FAILED" | "error">("loading");

  useEffect(() => {
    if (!paymentId) { setStatus("error"); return; }
    void cpapi<{ status: string }>(`/portal/pay/${paymentId}/confirm`, { method: "POST" })
      .then((r) => setStatus(r.status === "PAID" ? "PAID" : r.status === "FAILED" ? "FAILED" : "PENDING"))
      .catch(() => setStatus("error"));
  }, [paymentId]);

  const ok = status === "PAID";
  const pending = status === "PENDING" || status === "loading";
  const Icon = ok ? CheckCircle2 : pending ? Clock : XCircle;
  const tone = ok ? "text-success" : pending ? "text-warning" : "text-danger";
  const bg = ok ? "bg-success-soft" : pending ? "bg-warning-soft" : "bg-danger-soft";

  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-7 text-center shadow-card">
        <div className={`mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full ${bg} ${tone}`}><Icon size={30} /></div>
        <h1 className="text-lg font-bold text-ink">{status === "loading" ? t("confirming") : t(`result.${ok ? "paid" : pending ? "pending" : "failed"}`)}</h1>
        <p className="mt-1 text-[12.5px] text-subtle">{status === "loading" ? t("confirmingSub") : t(`resultSub.${ok ? "paid" : pending ? "pending" : "failed"}`)}</p>
        {status !== "loading" ? (
          <div className="mt-5 flex flex-col gap-2">
            <Link href="/portal/statement" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-semibold text-white hover:opacity-90">{t("backToStatement")}</Link>
            <Link href="/portal/dashboard" className="text-[12.5px] text-muted hover:text-ink">{t("backToHome")}</Link>
          </div>
        ) : null}
        <p className="mt-4 flex items-center justify-center gap-1 text-[10.5px] text-subtle"><ShieldCheck size={11} /> {t("secured")}</p>
      </div>
    </div>
  );
}

export default function PortalPayReturnPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-bg text-subtle">…</div>}>
      <PayReturnInner />
    </Suspense>
  );
}
