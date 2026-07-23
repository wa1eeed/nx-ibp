"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, Wallet2, Search, Landmark, CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/ConfirmProvider";

interface WalletRow { service: string; balance: number; tenantId: string }
interface CheckRow { id: string; checkType: string; status: string; cost: string | null; riskLevel: string | null; createdAt: string }
interface VerifyResult { provider: string; cost: number; riskLevel: string | null; data: Record<string, unknown> }

const RISK_TONE: Record<string, BadgeTone> = { low: "success", medium: "warning", high: "danger" };

export default function VerificationPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const router = useRouter();
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [nationalId, setNationalId] = useState("1012345678");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  // التحقّق من السجل التجاري (البيانات المفتوحة)
  const [crNumber, setCrNumber] = useState("1010000001");
  const [crResult, setCrResult] = useState<{ found: boolean; crNumber?: string; source?: string; data?: Record<string, unknown> } | null>(null);
  const [crMeta, setCrMeta] = useState<{ count: number; source: string | null } | null>(null);
  const [crBusy, setCrBusy] = useState(false);

  const load = useCallback(async () => {
    const [w, c] = await Promise.all([api<WalletRow[]>("/verification/wallets"), api<CheckRow[]>("/verification/checks")]);
    setWallets(w); setChecks(c);
  }, []);
  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    void load().catch(() => undefined);
    void api<{ count: number; source: string | null }>("/verification/cr-registry/meta").then(setCrMeta).catch(() => undefined);
  }, [load, router]);

  async function runCr(e: FormEvent) {
    e.preventDefault();
    setError(""); setCrResult(null); setCrBusy(true);
    try {
      const res = await api<{ found: boolean; crNumber?: string; source?: string; data?: Record<string, unknown> }>("/verification/cr-registry", { method: "POST", body: JSON.stringify({ crNumber }) });
      setCrResult(res);
      if (res.found) await load();
    } catch (err) { setError(err instanceof ApiError ? `${err.message} (${err.status})` : err instanceof Error ? `تعذّر الوصول للخادم: ${err.message}` : "خطأ غير معروف"); }
    finally { setCrBusy(false); }
  }

  async function runYaqeen(e: FormEvent) {
    e.preventDefault();
    const ok = await confirm({
      title: t("confirm.runYaqeen.title"),
      description: t("confirm.runYaqeen.desc"),
      confirmLabel: t("confirm.runYaqeen.action"),
    });
    if (!ok) return;
    setError(""); setResult(null);
    try {
      const res = await api<VerifyResult>("/verification/yaqeen", { method: "POST", body: JSON.stringify({ nationalId }) });
      setResult(res);
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "خطأ"); }
  }

  return (
    <div>
      <PageHeader title={t("verification.title")} subtitle={t("verification.subtitle")} />
      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {/* أرصدة العمليات */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {wallets.map((w) => (
          <div key={w.service} className="rounded-card border border-line bg-card p-4 shadow-card">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[12.5px] text-muted">{t(`verification.providers.${w.service}`)}</div>
                <div className="mt-1.5 text-2xl font-bold text-ink tnum">{w.balance}</div>
                <div className="mt-1 text-[11px] text-subtle">{t("verification.opsLeft")}</div>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary"><Wallet2 size={18} /></span>
            </div>
          </div>
        ))}
      </div>

      {/* سحب تجريبي (يقين) يعبّئ النموذج */}
      <div className="mb-5 rounded-card border border-line bg-card p-5 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-ink"><BadgeCheck size={17} className="text-primary" />{t("verification.smartFill")}</div>
        <form onSubmit={runYaqeen} className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{t("verification.nationalId")}</span>
            <input value={nationalId} onChange={(e) => setNationalId(e.target.value)} className="h-9 w-56 rounded-lg border border-line bg-card px-3 text-[13px] tnum" /></label>
          <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary"><Search size={15} />{t("verification.runYaqeen")}</button>
        </form>
        {result ? (
          <div className="mt-4 rounded-lg border border-line bg-surface-2/40 p-3">
            <div className="mb-2 text-[12px] font-semibold text-success">✓ {t("verification.fetched")} ({result.provider} · {result.cost} SAR)</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-3">
              {Object.entries(result.data).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 border-b border-line/60 py-1"><span className="text-subtle">{k}</span><span className="font-medium text-ink">{String(v)}</span></div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* التحقّق من السجل التجاري — البيانات المفتوحة (وزارة التجارة) */}
      <div className="mb-5 rounded-card border border-line bg-card p-5 shadow-card">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[14px] font-semibold text-ink"><Landmark size={17} className="text-primary" />{t("verification.cr.title")}</div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-medium text-primary-strong">
            <BadgeCheck size={12} /> {t("verification.cr.source")}{crMeta ? ` · ${t("verification.cr.count", { n: crMeta.count })}` : ""}
          </span>
        </div>
        <p className="mb-3 text-[12px] text-subtle">{t("verification.cr.hint")}</p>
        <form onSubmit={runCr} className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{t("verification.cr.crNumber")}</span>
            <input value={crNumber} onChange={(e) => setCrNumber(e.target.value)} inputMode="numeric" placeholder="1010000000" className="h-9 w-56 rounded-lg border border-line bg-card px-3 text-[13px] tnum" /></label>
          <button type="submit" disabled={crBusy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><Search size={15} />{crBusy ? "…" : t("verification.cr.run")}</button>
        </form>
        {crResult ? (
          crResult.found && crResult.data ? (
            <div className="mt-4 rounded-lg border border-success/30 bg-success-soft/40 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-success"><CheckCircle2 size={15} /> {t("verification.cr.found")}</div>
              <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2">
                {(["name", "crNumber", "unifiedNumber", "activity", "legalEntity", "registryType", "region", "city", "capital", "issueDate"] as const).map((k) =>
                  crResult.data![k] ? (
                    <div key={k} className="flex justify-between gap-2 border-b border-line/60 py-1">
                      <span className="text-subtle">{t(`verification.cr.fields.${k}`)}</span>
                      <span className="font-medium text-ink">{k === "capital" ? `${Number(crResult.data![k]).toLocaleString("en-US")} ${t("common.sar")}` : String(crResult.data![k])}</span>
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning-soft/40 px-3 py-2.5 text-[12.5px] font-medium text-warning">
              <XCircle size={15} /> {t("verification.cr.notFound", { cr: crResult.crNumber ?? crNumber })}
            </div>
          )
        ) : null}
      </div>

      {/* سجل عمليات التحقّق */}
      <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="border-b border-line px-5 py-3 text-[14px] font-semibold text-ink">{t("verification.history")}</div>
        {checks.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-muted">{t("verification.noChecks")}</div>
        ) : (
          <table className="w-full">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("verification.col.type")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("verification.col.status")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("verification.col.cost")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("verification.col.risk")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("verification.col.date")}</th></tr></thead>
            <tbody className="divide-y divide-line">
              {checks.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[13px] text-ink">{c.checkType}</td>
                  <td className="px-5 py-3"><Badge tone="success">{c.status}</Badge></td>
                  <td className="px-5 py-3 text-[12.5px] text-muted tnum">{c.cost ?? "0"}</td>
                  <td className="px-5 py-3">{c.riskLevel ? <Badge tone={RISK_TONE[c.riskLevel] ?? "neutral"}>{c.riskLevel}</Badge> : "—"}</td>
                  <td className="px-5 py-3 text-[12px] text-subtle tnum">{c.createdAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
