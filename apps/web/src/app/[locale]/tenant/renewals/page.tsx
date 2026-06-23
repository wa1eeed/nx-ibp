"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Due { id: string; sequenceNo: string | null; insurerName: string | null; endDate: string | null; productLineCode: string | null; tenantId: string }

export default function RenewalsPage() {
  const t = useTranslations();
  const router = useRouter();
  const [rows, setRows] = useState<Due[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string>("");

  const load = useCallback(async () => setRows(await api<Due[]>("/renewals?days=60")), []);
  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    void load().catch(() => undefined);
  }, [load, router]);

  async function initiate(policyId: string) {
    setError(""); setDone("");
    try {
      const sr = await api<{ sequenceNo: string }>(`/renewals/${policyId}/initiate`, { method: "POST" });
      setDone(t("renewals.initiated", { seq: sr.sequenceNo }));
    } catch (e) { setError(e instanceof ApiError ? e.message : "خطأ"); }
  }

  return (
    <div>
      <PageHeader title={t("renewals.title")} subtitle={t("renewals.subtitle")} />
      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      {done ? <p className="mb-3 rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{done}</p> : null}

      {rows.length === 0 ? (
        <div className="grid min-h-[40vh] place-items-center rounded-card border border-dashed border-line bg-card text-center shadow-card text-muted"><div><CalendarClock size={28} className="mx-auto mb-2 text-subtle" /><p className="text-[13px]">{t("renewals.empty")}</p></div></div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <table className="w-full">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("renewals.col.seq")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("renewals.col.insurer")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("renewals.col.end")}</th>
              <th className="px-5 py-3"></th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{r.sequenceNo ?? "—"}</td>
                  <td className="px-5 py-3 text-[13px] text-ink">{r.insurerName ?? "—"}</td>
                  <td className="px-5 py-3 text-[12.5px] text-muted tnum">{r.endDate ? r.endDate.slice(0, 10) : "—"}</td>
                  <td className="px-5 py-3 text-end">
                    <button onClick={() => initiate(r.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-primary hover:bg-surface-2">
                      <RefreshCw size={13} /> {t("renewals.initiate")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
