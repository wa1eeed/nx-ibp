"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, CalendarClock, AlertTriangle, Clock3, Coins, Loader2, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { usePermissions } from "@/hooks/usePermissions";

interface Due { id: string; sequenceNo: string | null; insurerName: string | null; endDate: string | null; totalPremium: string | null; commissionAmount: string | null; clientName: string | null; productLineCode: string | null }

const WINDOWS = [30, 60, 90] as const;
const daysLeft = (end: string | null) => (end == null ? null : Math.ceil((new Date(end).getTime() - Date.now()) / 86400000));
const fmt = (n: string | number | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

export default function RenewalsPage() {
  const t = useTranslations("renewals");
  const confirm = useConfirm();
  const router = useRouter();
  const { can } = usePermissions();
  const canRenew = can("renewals", "create");
  const [rows, setRows] = useState<Due[]>([]);
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(60);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async (d: number) => setRows(await api<Due[]>(`/renewals?days=${d}`)), []);
  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    void load(days).catch(() => undefined);
  }, [load, days, router]);

  async function initiate(policyId: string) {
    const ok = await confirm({ title: t("confirmTitle"), description: t("confirmDesc"), confirmLabel: t("initiate") });
    if (!ok) return;
    setError(""); setDone(""); setBusy(policyId);
    try {
      const req = await api<{ id: string; sequenceNo: string }>(`/renewals/${policyId}/initiate`, { method: "POST" });
      setDone(t("initiated", { seq: req.sequenceNo }));
      // ينتقل مباشرةً لطلب التأمين (التجديد) المُنشأ ليكمل دورة RFQ — تجربة واضحة بدل بقاء الزر كما هو
      router.push(`/tenant/requests/${req.id}`);
    } catch (e) { setError(e instanceof ApiError ? e.message : "خطأ"); setBusy(""); }
  }

  const expired = rows.filter((r) => (daysLeft(r.endDate) ?? 0) < 0);
  const soon = rows.filter((r) => { const d = daysLeft(r.endDate); return d != null && d >= 0 && d <= 30; });
  const upcoming = rows.filter((r) => (daysLeft(r.endDate) ?? 0) > 30);
  const premiumAtRisk = rows.reduce((s, r) => s + Number(r.totalPremium ?? 0), 0);

  const kpi = (label: string, value: string | number, Icon: typeof Coins, tone: string) => (
    <div className="rounded-card border border-line bg-card p-3.5">
      <div className="flex items-center justify-between"><span className="text-[11.5px] text-subtle">{label}</span><Icon size={15} className={tone} /></div>
      <div className="mt-1 text-[20px] font-bold text-ink tnum">{value}</div>
    </div>
  );

  const urgency = (d: number | null) => {
    if (d == null) return <span className="text-subtle">—</span>;
    if (d < 0) return <Badge tone="danger">{t("expiredBy", { n: Math.abs(d) })}</Badge>;
    if (d <= 30) return <Badge tone="warning">{d} {t("daysLeft")}</Badge>;
    return <Badge tone="neutral">{d} {t("daysLeft")}</Badge>;
  };

  return (
    <div>
      <PageHeader
        title={t("title")} subtitle={t("subtitle")}
        actions={
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-card p-0.5">
            {WINDOWS.map((w) => (
              <button key={w} onClick={() => setDays(w)} className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold ${days === w ? "bg-primary-strong text-primary-fg" : "text-subtle hover:text-ink"}`}>{w}{t("dayShort")}</button>
            ))}
          </div>
        }
      />
      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      {done ? <p className="mb-3 rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{done}</p> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpi(t("kpi.expired"), expired.length, AlertTriangle, "text-danger")}
        {kpi(t("kpi.soon"), soon.length, Clock3, "text-warning")}
        {kpi(t("kpi.upcoming"), upcoming.length, CalendarClock, "text-subtle")}
        {kpi(t("kpi.atRisk"), fmt(premiumAtRisk), Coins, "text-primary")}
      </div>

      {rows.length === 0 ? (
        <div className="grid min-h-[30vh] place-items-center rounded-card border border-dashed border-line bg-card text-center text-muted shadow-card"><div><CalendarClock size={28} className="mx-auto mb-2 text-subtle" /><p className="text-[13px]">{t("empty")}</p></div></div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <div className="overflow-x-auto"><table className="w-full">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("col.seq")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("col.client")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("col.insurer")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("col.premium")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("col.end")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("col.urgency")}</th>
              <th className="px-4 py-3"></th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[12.5px] font-medium tnum"><Link href={`/tenant/policies/${r.id}`} className="text-ink hover:text-primary hover:underline">{r.sequenceNo ?? "—"}</Link></td>
                  <td className="px-4 py-3 text-[12.5px] text-ink">{r.clientName ?? "—"}</td>
                  <td className="px-4 py-3 text-[12.5px] text-ink">{r.insurerName ?? "—"}</td>
                  <td className="px-4 py-3 text-[12.5px] tnum">{fmt(r.totalPremium)}</td>
                  <td className="px-4 py-3 text-[12.5px] text-muted tnum">{r.endDate ? r.endDate.slice(0, 10) : "—"}</td>
                  <td className="px-4 py-3">{urgency(daysLeft(r.endDate))}</td>
                  <td className="px-4 py-3 text-end">
                    {canRenew ? (
                      <button onClick={() => initiate(r.id)} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-primary hover:bg-surface-2 disabled:opacity-60">
                        {busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {busy === r.id ? t("initiating") : t("initiate")}
                      </button>
                    ) : <span className="text-[11.5px] text-subtle">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
