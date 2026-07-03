"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Landmark, FileCheck2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/ConfirmProvider";

interface Policy {
  id: string;
  sequenceNo: string | null;
  status: string;
  insurerName: string | null;
  premium: string | null;
  totalPremium: string | null;
  commissionAmount: string | null;
  productLineCode: string | null;
  pendingApprovals?: string[];
}

const STATUS_TONE: Record<string, BadgeTone> = {
  TECHNICAL_REVIEW: "warning",
  FINANCE_REVIEW: "info",
  ISSUED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

export default function PoliciesPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const router = useRouter();
  const [rows, setRows] = useState<Policy[]>([]);
  const [stepNames, setStepNames] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const p = await api<Policy[]>("/policies");
    setRows(p);
    // أسماء خطوات الاعتماد (اختياري — يتطلّب صلاحية الإعدادات؛ نتحمّل تعذّره)
    try {
      const c = await api<{ steps: { key: string; name: string }[] }>("/config/approval-chain");
      setStepNames(Object.fromEntries(c.steps.map((s) => [s.key, s.name])));
    } catch { /* تجاهل */ }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void load().catch(() => undefined);
  }, [load, router]);

  async function act(path: string, kind: "approveTechnical" | "approveFinance") {
    const ok = await confirm({
      title: t(`confirm.${kind}.title`),
      description: t(`confirm.${kind}.desc`),
      confirmLabel: t(`confirm.${kind}.action`),
    });
    if (!ok) return;
    setError("");
    try {
      await api(path, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "خطأ");
    }
  }

  async function approveStep(policyId: string, stepKey: string) {
    const ok = await confirm({
      title: t("confirm.approveStep.title"),
      description: t("confirm.approveStep.desc"),
      confirmLabel: t("confirm.approveStep.action"),
    });
    if (!ok) return;
    setError("");
    try {
      await api(`/policies/${policyId}/approve-step`, { method: "POST", body: JSON.stringify({ stepKey }) });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "خطأ");
    }
  }

  const fmt = (n: string | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

  return (
    <div>
      <PageHeader title={t("policies.title")} subtitle={t("policies.subtitle")} />
      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {rows.length === 0 ? (
        <div className="grid min-h-[40vh] place-items-center rounded-card border border-dashed border-line bg-card text-center shadow-card">
          <div className="text-muted">
            <FileCheck2 size={28} className="mx-auto mb-2 text-subtle" />
            <p className="text-[13px]">{t("policies.empty")}</p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                  <th className="px-5 py-3 text-start font-semibold">{t("policies.col.seq")}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t("policies.col.insurer")}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t("policies.col.premium")}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t("policies.col.commission")}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t("policies.col.status")}</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-surface-2/60">
                    <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{p.sequenceNo ?? "—"}</td>
                    <td className="px-5 py-3 text-[13px] text-ink">{p.insurerName ?? "—"}</td>
                    <td className="px-5 py-3 text-[12.5px] tnum">{fmt(p.totalPremium)}</td>
                    <td className="px-5 py-3 text-[12.5px] text-muted tnum">{fmt(p.commissionAmount)}</td>
                    <td className="px-5 py-3"><Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge></td>
                    <td className="px-5 py-3 text-end">
                      {p.status === "TECHNICAL_REVIEW" ? (
                        <button onClick={() => act(`/policies/${p.id}/approve-technical`, "approveTechnical")} className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-primary hover:bg-surface-2">
                          <CheckCircle2 size={13} /> {t("policies.approveTechnical")}
                        </button>
                      ) : p.status === "FINANCE_REVIEW" && (p.pendingApprovals?.length ?? 0) > 0 ? (
                        <button onClick={() => approveStep(p.id, p.pendingApprovals![0])} className="inline-flex items-center gap-1 rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-[12px] font-semibold text-warning hover:bg-warning/20">
                          <CheckCircle2 size={13} /> {t("policies.approveStep")}: {stepNames[p.pendingApprovals![0]] ?? p.pendingApprovals![0]}
                        </button>
                      ) : p.status === "FINANCE_REVIEW" ? (
                        <button onClick={() => act(`/finance/policies/${p.id}/approve`, "approveFinance")} className="inline-flex items-center gap-1 rounded-lg bg-primary-strong px-2.5 py-1.5 text-[12px] font-semibold text-primary-fg hover:bg-primary">
                          <Landmark size={13} /> {t("policies.approveFinance")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
