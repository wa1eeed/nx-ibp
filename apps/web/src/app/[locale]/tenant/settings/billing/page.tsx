"use client";

import { useEffect, useState } from "react";
import { CreditCard, CheckCircle2, Loader2, Clock, CalendarClock, Users, ArrowLeftRight, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api, ApiError } from "@/lib/api";

type Cycle = "MONTHLY" | "YEARLY";
interface Plan { code: string; name: string; seatLimit: number; priceMonthly: string; priceYearly: string }
interface Invoice { id: string; planCode: string; cycle: Cycle; amount: string; currency: string; status: string; paidAt: string | null; createdAt: string }
interface SubInfo { status?: string; trialEndsAt?: string | null; subscription?: { cycle: Cycle; seatsUsed: number; renewsAt: string | null; plan: { code: string; name: string; seatLimit: number } } | null }
interface StorageUsage { usedBytes: number; quotaBytes: number; quotaMb: number; percentUsed: number }
interface SeatInfo { activeUsers: number; perUser: number; periodCost: number; currency: string; cycle: Cycle; daysRemaining: number; addUnit: number; pendingAmount: number; pendingKind: "charge" | "credit" | "none"; isTrial: boolean }

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
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [seatInfo, setSeatInfo] = useState<SeatInfo | null>(null);
  const [cycle, setCycle] = useState<Cycle>("MONTHLY");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [s, p, inv, st, seat] = await Promise.all([
      api<SubInfo>("/billing/subscription"),
      api<Plan[]>("/billing/plans"),
      api<Invoice[]>("/billing/invoices"),
      api<StorageUsage>("/documents/usage"),
      api<SeatInfo>("/billing/seats"),
    ]);
    setSub(s); setPlans(p); setInvoices(inv); setStorage(st); setSeatInfo(seat);
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
  const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");
  const daysUntil = (d: string | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null);

  const isTrial = sub?.status === "TRIAL";
  const trialDaysLeft = daysUntil(sub?.trialEndsAt ?? null);

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

      {/* شريط الفترة التجريبية — متى يُستحقّ الدفع */}
      {isTrial && sub?.trialEndsAt ? (
        <p className={["flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12.5px] font-medium", (trialDaysLeft ?? 99) <= 3 ? "bg-danger/10 text-danger" : "bg-warning-soft text-warning"].join(" ")}>
          <Clock size={16} className="mt-0.5 shrink-0" />
          {t("trialBanner", { date: date(sub.trialEndsAt), days: Math.max(0, trialDaysLeft ?? 0) })}
        </p>
      ) : null}

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
          <div><div className="text-[11.5px] text-subtle">{t("seats")}</div><div className="mt-1 font-semibold text-ink">{sub?.subscription?.seatsUsed ?? 0} <span className="text-[11px] font-normal text-subtle">· {t("seatsUnlimited")}</span></div></div>
          {isTrial && sub?.trialEndsAt ? (
            <div><div className="inline-flex items-center gap-1 text-[11.5px] text-subtle"><CalendarClock size={12} /> {t("trialEndsAt")}</div><div className="mt-1 font-semibold text-warning tnum">{date(sub.trialEndsAt)}</div></div>
          ) : (
            <div><div className="inline-flex items-center gap-1 text-[11.5px] text-subtle"><CalendarClock size={12} /> {t("renewsAt")}</div><div className="mt-1 font-semibold text-ink tnum">{date(sub?.subscription?.renewsAt ?? null)}</div></div>
          )}
        </div>
        {storage ? (
          <div className="mt-4 border-t border-line pt-4">
            <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
              <span className="text-subtle">{t("storage")}</span>
              <span className="font-semibold text-ink tnum">{(storage.usedBytes / 1073741824).toFixed(2)} {t("storageOf")} {Math.round((storage.quotaMb / 1024) * 10) / 10} GB</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div className={["h-full rounded-full", storage.percentUsed >= 90 ? "bg-danger" : storage.percentUsed >= 70 ? "bg-warning" : "bg-primary"].join(" ")} style={{ width: `${Math.min(100, storage.percentUsed)}%` }} />
            </div>
          </div>
        ) : null}
      </section>

      {/* المستخدمون والفوترة + الاحتساب التناسبي + نقل/إلغاء الرخصة */}
      {seatInfo ? (
        <section className="rounded-card border border-line bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Users size={16} className="text-primary" />
            <h2 className="text-[13px] font-bold text-ink">{t("seatsTitle")}</h2>
          </div>
          <p className="mb-4 text-[12px] leading-relaxed text-subtle">{t("seatsModel")}</p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
              <div className="text-[11.5px] text-subtle">{t("activeUsers")}</div>
              <div className="mt-1 text-[22px] font-bold text-ink tnum">{seatInfo.activeUsers}</div>
            </div>
            <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
              <div className="text-[11.5px] text-subtle">{t("perUserRate")}</div>
              <div className="mt-1 text-[15px] font-bold text-ink tnum">{fmt(String(seatInfo.perUser))} <span className="text-[11px] font-normal text-subtle">{seatInfo.cycle === "YEARLY" ? t("perYear") : t("perMonth")}</span></div>
            </div>
            <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
              <div className="text-[11.5px] text-subtle">{t("periodCost")}</div>
              <div className="mt-1 text-[15px] font-bold text-ink tnum">{fmt(String(seatInfo.periodCost))} <span className="text-[11px] font-normal text-subtle">{seatInfo.currency}</span></div>
            </div>
          </div>

          {/* الاحتساب التناسبي */}
          <div className="mt-4 rounded-xl border border-line p-3.5">
            <div className="mb-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink"><Info size={13} className="text-primary" /> {t("prorationTitle")}</div>
            <p className="text-[12px] leading-relaxed text-muted">{t("addUnitHint", { amount: fmt(String(seatInfo.addUnit)), currency: seatInfo.currency, days: seatInfo.daysRemaining })}</p>
            {seatInfo.pendingKind === "charge" ? (
              <p className="mt-2 rounded-lg bg-warning-soft px-2.5 py-1.5 text-[12px] font-medium text-warning">{t("pendingCharge", { amount: fmt(String(seatInfo.pendingAmount)), currency: seatInfo.currency })}</p>
            ) : seatInfo.pendingKind === "credit" ? (
              <p className="mt-2 rounded-lg bg-success/10 px-2.5 py-1.5 text-[12px] font-medium text-success">{t("pendingCredit", { amount: fmt(String(seatInfo.pendingAmount)), currency: seatInfo.currency })}</p>
            ) : null}
          </div>

          {/* نقل/إلغاء الرخصة */}
          <div className="mt-3 rounded-xl border border-line p-3.5">
            <div className="mb-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink"><ArrowLeftRight size={13} className="text-primary" /> {t("licenseTitle")}</div>
            <ul className="space-y-1.5 text-[12px] leading-relaxed text-muted">
              <li>• {t("licenseTransfer")}</li>
              <li>• {t("licenseCancel")}</li>
            </ul>
            <Link href="/tenant/settings/staff" className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-surface">
              <Users size={14} /> {t("manageUsers")}
            </Link>
          </div>
        </section>
      ) : null}

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
                <div className="mt-1 text-[11.5px] text-subtle">{t("seatsUnlimited")}</div>
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
