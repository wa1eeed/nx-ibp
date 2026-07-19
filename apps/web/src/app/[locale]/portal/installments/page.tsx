"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, AlertTriangle, Wallet, CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import { cpapi, ApiError } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Inst {
  id: string; seq: number; dueDate: string; amount: number; settled: number; outstanding: number; status: string; days: number;
  debitNoteId: string; policyRef: string | null; insurerName: string | null; productLineCode: string | null;
}
interface Summary {
  count: number; paidCount: number; paidTotal: number; outstanding: number;
  overdueCount: number; overdueAmount: number; dueSoonAmount: number; nextDue: Inst | null;
}
interface Data { summary: Summary; installments: Inst[]; paymentEnabled: boolean }

const TONE: Record<string, BadgeTone> = { paid: "success", partial: "info", overdue: "danger", due: "warning" };

export default function PortalInstallments() {
  const t = useTranslations();
  const [d, setD] = useState<Data | null>(null);
  const [paying, setPaying] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { void cpapi<Data>("/portal/installments").then(setD).catch(() => setD(null)); }, []);

  const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = (s: string) => new Date(s).toLocaleDateString("en-GB");
  const period = (r: Inst) => r.status === "overdue" ? t("portal.installments.lateBy", { n: r.days }) : r.status === "paid" ? "—" : t("portal.installments.dueIn", { n: r.days });

  async function pay(r: Inst) {
    setErr(""); setPaying(r.id);
    try {
      const res = await cpapi<{ redirectUrl: string | null }>("/portal/pay", { method: "POST", body: JSON.stringify({ debitNoteId: r.debitNoteId, amount: r.outstanding }) });
      if (res.redirectUrl) window.location.href = res.redirectUrl;
      else { setErr(t("portal.pay.noRedirect")); setPaying(""); }
    } catch (e) { setErr(e instanceof ApiError ? e.message : t("portal.pay.error")); setPaying(""); }
  }

  const s = d?.summary;
  return (
    <PortalShell>
      <PageHeader title={t("portal.installments.title")} subtitle={t("portal.installments.subtitle")} />

      {err ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{err}</p> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="success" icon={<CheckCircle2 size={18} />} title={t("portal.installments.paid")} value={s ? m(s.paidTotal) : "…"} sub={s ? t("portal.installments.paidCount", { n: s.paidCount }) : undefined} />
        <StatCard tone="warning" icon={<Wallet size={18} />} title={t("portal.installments.outstanding")} value={s ? m(s.outstanding) : "…"} sub={t("common.sar")} />
        <StatCard tone={s && s.overdueCount > 0 ? "danger" : "info"} icon={<AlertTriangle size={18} />} title={t("portal.installments.overdue")} value={s ? s.overdueCount : "…"} sub={s && s.overdueCount ? `${m(s.overdueAmount)} ${t("common.sar")}` : undefined} />
        <StatCard tone="info" icon={<CalendarClock size={18} />} title={t("portal.installments.nextDue")} value={s?.nextDue ? date(s.nextDue.dueDate) : "—"} sub={s?.nextDue ? `${m(s.nextDue.outstanding)} ${t("common.sar")}` : undefined} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[720px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
            <th className="px-5 py-3 text-start font-semibold">{t("portal.installments.policy")}</th>
            <th className="px-4 py-3 text-start font-semibold">{t("portal.installments.due")}</th>
            <th className="px-4 py-3 text-start font-semibold">{t("portal.installments.period")}</th>
            <th className="px-4 py-3 text-end font-semibold">{t("portal.installments.amount")}</th>
            <th className="px-4 py-3 text-end font-semibold">{t("portal.installments.remaining")}</th>
            <th className="px-4 py-3 text-center font-semibold">{t("portal.installments.status")}</th>
            {d?.paymentEnabled ? <th className="px-4 py-3" /> : null}
          </tr></thead>
          <tbody className="divide-y divide-line">
            {(d?.installments ?? []).map((r) => (
              <tr key={r.id} className="hover:bg-surface-2/60">
                <td className="px-5 py-3 text-[12.5px] text-ink">
                  <div className="font-medium tnum">{r.policyRef ?? "—"} <span className="text-subtle">#{r.seq}</span></div>
                  <div className="text-[11px] text-subtle">{r.insurerName ?? ""}</div>
                </td>
                <td className="px-4 py-3 text-[12px] text-muted tnum">{date(r.dueDate)}</td>
                <td className={`px-4 py-3 text-[12px] font-medium tnum ${r.status === "overdue" ? "text-danger" : r.status === "paid" ? "text-subtle" : "text-warning"}`}>{period(r)}</td>
                <td className="px-4 py-3 text-end text-[12.5px] text-ink tnum">{m(r.amount)}</td>
                <td className={`px-4 py-3 text-end text-[12.5px] tnum ${r.outstanding > 0 ? "font-semibold text-warning" : "text-success"}`}>{m(r.outstanding)}</td>
                <td className="px-4 py-3 text-center"><Badge tone={TONE[r.status] ?? "neutral"}>{t(`portal.installments.st.${r.status}`)}</Badge></td>
                {d?.paymentEnabled ? (
                  <td className="px-4 py-3 text-end">
                    {r.outstanding > 0 ? (
                      <button onClick={() => pay(r)} disabled={!!paying} className="inline-flex items-center gap-1 rounded-lg bg-primary-strong px-2.5 py-1.5 text-[12px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">
                        <CreditCard size={13} /> {paying === r.id ? "…" : t("portal.pay.button")}
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
            {d && d.installments.length === 0 ? <tr><td colSpan={d.paymentEnabled ? 7 : 6} className="px-5 py-10 text-center text-[13px] text-subtle">{t("portal.installments.empty")}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed text-subtle">{t("portal.installments.note")}</p>
    </PortalShell>
  );
}
