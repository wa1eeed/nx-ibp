"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { papi, ApiError } from "@/lib/api";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";

export default function AdminSecurityPage() {
  const t = useTranslations("admin.mfa");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const s = await papi<{ enabled: boolean }>("/platform/mfa/status");
    setEnabled(s.enabled);
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  async function startSetup() {
    setError(""); setNotice("");
    try { setSetup(await papi("/platform/mfa/setup", { method: "POST" })); }
    catch (e) { setError(e instanceof ApiError ? e.message : t("wrong")); }
  }
  async function enable() {
    setError(""); setNotice("");
    try { await papi("/platform/mfa/enable", { method: "POST", body: JSON.stringify({ code }) }); setSetup(null); setCode(""); setNotice(t("enabled")); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : t("wrong")); }
  }
  async function disable() {
    setError(""); setNotice("");
    try { await papi("/platform/mfa/disable", { method: "POST", body: JSON.stringify({ code }) }); setCode(""); setNotice(t("disabled")); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : t("wrong")); }
  }

  const codeInput = (onDo: () => void, label: string) => (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="mb-1 block text-[12px] font-medium text-muted">{t("codeLabel")}</span>
        <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" dir="ltr"
          className="h-10 w-40 rounded-lg border border-line bg-card px-3 text-center text-[15px] tracking-widest tnum" />
      </label>
      <button onClick={onDo} disabled={code.length < 6} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-ink px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
        <KeyRound size={15} /> {label}
      </button>
    </div>
  );

  return (
    <AdminShell>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      {notice ? <p className="mb-3 rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{notice}</p> : null}

      <section className="max-w-xl rounded-card border border-line bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center gap-2 text-[13px]">
          <span className="text-muted">{t("status")}:</span>
          {enabled ? <Badge tone="success">{t("on")}</Badge> : <Badge tone="neutral">{t("off")}</Badge>}
        </div>

        {enabled ? (
          <div className="space-y-3">
            <p className="text-[12.5px] text-subtle">{t("subtitle")}</p>
            {codeInput(disable, t("disable"))}
            <p className="inline-flex items-center gap-1 text-[12px] text-danger"><ShieldOff size={14} /> {t("disable")}</p>
          </div>
        ) : setup ? (
          <div className="space-y-3">
            <p className="text-[12.5px] text-ink">{t("scan")}</p>
            <div className="rounded-lg border border-line bg-surface-2 p-3 text-center">
              <div className="text-[11px] text-subtle">Secret</div>
              <div dir="ltr" className="mt-1 select-all break-all font-mono text-[13px] font-bold text-ink">{setup.secret}</div>
            </div>
            <div dir="ltr" className="select-all break-all text-[11px] text-subtle">{setup.otpauthUri}</div>
            {codeInput(enable, t("enable"))}
          </div>
        ) : (
          <button onClick={startSetup} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary">
            <ShieldCheck size={16} /> {t("setup")}
          </button>
        )}
      </section>
    </AdminShell>
  );
}
