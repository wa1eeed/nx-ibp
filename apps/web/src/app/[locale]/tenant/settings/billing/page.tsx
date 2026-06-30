"use client";

import { useEffect, useState } from "react";
import { CreditCard, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";

type Cycle = "MONTHLY" | "YEARLY";
interface Plan { code: string; name: string; seatLimit: number; priceMonthly: string; priceYearly: string }
interface Invoice { id: string; planCode: string; cycle: Cycle; amount: string; currency: string; status: string; paidAt: string | null; createdAt: string }
interface SubInfo { status?: string; subscription?: { cycle: Cycle; seatsUsed: number; renewsAt: string | null; plan: { code: string; name: string; seatLimit: number } } | null }

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-success/10 text-success", PAID: "bg-success/10 text-success",
  TRIAL: "bg-warning/10 text-warning", PENDING: "bg-warning/10 text-warning",
  SUSPENDED: "bg-danger/10 text-danger", FAILED: "bg-danger/10 text-danger", CANCELLED: "bg-danger/10 text-danger",
};

export default function BillingPage() {
  const t = useTranslations("billing");
  const [sub, setSub] = useState<SubInfo | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cycle, setCycle] = useState<Cycle>("MONTHLY");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [s, p, inv] = await Promise.all([
      api<SubInfo>("/billing/subscription"),
      api<Plan[]>("/billing/plans"),
      api<Invoice[]>("/billing/invoices"),
    ]);
    setSub(s); setPlans(p); setInvoices(inv);
  }
  useEffect(() => { load().catch(() => setError(t("error"))); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function subscribe(planCode: string) {
    setBusy(planCode); setError("");
    try {
      const res = await api<{ redirectUrl: string | null }>("/billing/checkout", { method: "POST", body: JSON.stringify({ planCode, cycle }) });
      if (res.redirectUrl) window.location.href = res.redirectUrl;
      else await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("error"));
      setBusy("");
    }
  }

  const price = (p: Plan) => (cycle === "YEARLY" ? p.priceYearly : p.priceMonthly);
  const planName = (code: string) => ({ basic: t("planBasic"), premium: t("planPremium"), enterprise: t("planEnterprise") }[code] ?? code);
  const fmt = (n: string) => Number(n).toLocaleString();
  const date = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><CreditCard size={20} /></div>
        <div>
          <h1 className="text-lg font-bold text-ink">{t("title")}</h1>
          <p className="text-[12.5px] text-subtle">{t("subtitle")}</p>
        </div>
      </header>

      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {/* الاشتراك الحالي */}
      <section className="rounded-card border border-line bg-card p-5">
        <h2 className="mb-3 text-[13px] font-bold text-ink">{t("current")}</h2>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-[13px]">
          <div><div className="text-[11.5px] text-subtle">{t("status")}</div>
            <span className={["mt-1 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold", STATUS_TONE[sub?.status ?? ""] ?? "bg-surface-2 text-muted"].join(" ")}>
              {t(`status${sub?.status ?? "TRIAL"}`)}
            </span>
          </div>
          <div><div className="text-[11.5px] text-subtle">{t("plan")}</div><div className="mt-1 font-semibold text-ink">{planName(sub?.subscription?.plan.code ?? "")}</div></div>
          <div><div className="text-[11.5px] text-subtle">{t("seats")}</div><div className="mt-1 font-semibold text-ink">{sub?.subscription?.seatsUsed ?? 0} / {sub?.subscription?.plan.seatLimit ?? "—"}</div></div>
          <div><div className="text-[11.5px] text-subtle">{t("renewsAt")}</div><div className="mt-1 font-semibold text-ink">{date(sub?.subscription?.renewsAt ?? null)}</div></div>
        </div>
      </section>

      {/* اختيار باقة */}
      <section className="rounded-card border border-line bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[13px] font-bold text-ink">{t("choosePlan")}</h2>
          <div className="inline-flex rounded-lg border border-line p-0.5 text-[12px]">
            {(["MONTHLY", "YEARLY"] as Cycle[]).map((c) => (
              <button key={c} onClick={() => setCycle(c)} className={["rounded-md px-3 py-1 font-semibold", cycle === c ? "bg-primary text-primary-fg" : "text-muted hover:text-ink"].join(" ")}>
                {c === "MONTHLY" ? t("cycleMonthly") : t("cycleYearly")}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {plans.map((p) => {
            const current = sub?.subscription?.plan.code === p.code && sub?.status === "ACTIVE";
            return (
              <div key={p.code} className="flex flex-col rounded-xl border border-line p-4">
                <div className="text-[13.5px] font-bold text-ink">{planName(p.code)}</div>
                <div className="mt-2 text-[20px] font-bold text-ink">{fmt(price(p))} <span className="text-[11.5px] font-normal text-subtle">{cycle === "YEARLY" ? t("perYear") : t("perMonth")}</span></div>
                <div className="mt-1 text-[11.5px] text-subtle">{p.seatLimit} {t("seats")}</div>
                <button
                  disabled={busy === p.code || current}
                  onClick={() => subscribe(p.code)}
                  className="mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary-strong text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"
                >
                  {current ? <><CheckCircle2 size={15} /> {t("statusACTIVE")}</> : busy === p.code ? <><Loader2 size={15} className="animate-spin" /> {t("processing")}</> : t("subscribe")}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* الفواتير */}
      <section className="rounded-card border border-line bg-card p-5">
        <h2 className="mb-3 text-[13px] font-bold text-ink">{t("invoices")}</h2>
        {invoices.length === 0 ? (
          <p className="text-[12.5px] text-subtle">{t("noInvoices")}</p>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-line text-start text-subtle">
              <th className="py-2 text-start font-medium">{t("invoiceDate")}</th>
              <th className="py-2 text-start font-medium">{t("plan")}</th>
              <th className="py-2 text-start font-medium">{t("invoiceAmount")}</th>
              <th className="py-2 text-start font-medium">{t("invoiceStatus")}</th>
            </tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-b border-line/60">
                  <td className="py-2 text-ink">{date(i.createdAt)}</td>
                  <td className="py-2 text-ink">{planName(i.planCode)}</td>
                  <td className="py-2 text-ink">{fmt(i.amount)} {i.currency}</td>
                  <td className="py-2"><span className={["rounded-full px-2 py-0.5 text-[11.5px] font-semibold", STATUS_TONE[i.status] ?? "bg-surface-2 text-muted"].join(" ")}>{i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
