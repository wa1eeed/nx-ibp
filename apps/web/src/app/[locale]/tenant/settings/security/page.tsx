"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, KeyRound, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";

/** أمان الحساب: المصادقة الثنائية (TOTP) للموظف + سياسة إلزام الشركة (لأصحاب صلاحية الإعدادات). */
export default function TenantSecurityPage() {
  const t = useTranslations("tenantSecurity");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [required, setRequired] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // سياسة الشركة (تظهر فقط لمن يملك صلاحية الإعدادات)
  const [canManageOrg, setCanManageOrg] = useState(false);
  const [orgRequired, setOrgRequired] = useState(false);
  const [retentionYears, setRetentionYears] = useState(10);

  const load = useCallback(async () => {
    const s = await api<{ enabled: boolean; required: boolean }>("/auth/mfa/status");
    setEnabled(s.enabled);
    setRequired(s.required);
    try {
      const [org, ret] = await Promise.all([
        api<{ mfaRequired: boolean }>("/config/security"),
        api<{ retentionYears: number }>("/config/retention"),
      ]);
      setCanManageOrg(true);
      setOrgRequired(org.mfaRequired);
      setRetentionYears(ret.retentionYears);
    } catch {
      setCanManageOrg(false); // بلا صلاحية الإعدادات ⇒ لا نعرض قسم الشركة
    }
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setError(""); setNotice("");
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : t("wrong")); }
  };
  const startSetup = () => run(async () => { setSetup(await api("/auth/mfa/setup", { method: "POST" })); });
  const enable = () => run(async () => { await api("/auth/mfa/enable", { method: "POST", body: JSON.stringify({ code }) }); setSetup(null); setCode(""); setNotice(t("enabled")); await load(); });
  const disable = () => run(async () => { await api("/auth/mfa/disable", { method: "POST", body: JSON.stringify({ code }) }); setCode(""); setNotice(t("disabled")); await load(); });
  const saveOrg = (val: boolean) => run(async () => { await api("/config/security", { method: "PUT", body: JSON.stringify({ mfaRequired: val }) }); setOrgRequired(val); setRequired(val); setNotice(t("orgSaved")); });
  const saveRetention = () => run(async () => { const r = await api<{ retentionYears: number }>("/config/retention", { method: "PUT", body: JSON.stringify({ retentionYears }) }); setRetentionYears(r.retentionYears); setNotice(t("retentionSaved")); });

  const codeInput = (onDo: () => void, label: string, danger = false) => (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="mb-1 block text-[12px] font-medium text-muted">{t("codeLabel")}</span>
        <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" dir="ltr"
          className="h-10 w-40 rounded-lg border border-line bg-card px-3 text-center text-[15px] tracking-widest tnum" />
      </label>
      <button onClick={onDo} disabled={code.length < 6}
        className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60 ${danger ? "bg-danger" : "bg-ink"}`}>
        <KeyRound size={15} /> {label}
      </button>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck size={20} /></div>
        <div><h1 className="text-lg font-bold text-ink">{t("title")}</h1><p className="text-[12.5px] text-subtle">{t("subtitle")}</p></div>
      </header>

      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      {notice ? <p className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{notice}</p> : null}
      {required && enabled === false ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] font-medium text-warning">{t("enrollNow")}</p> : null}

      {/* المصادقة الثنائية لحسابي */}
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-2 text-[13px]">
          <span className="font-semibold text-ink">{t("manageOwn")}</span>
          <span className="flex items-center gap-2">
            {required ? <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning"><Lock size={12} /> {t("requiredBadge")}</span> : null}
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${enabled ? "bg-success-soft text-success" : "bg-surface-2 text-subtle"}`}>
              {enabled ? <ShieldCheck size={12} /> : <ShieldOff size={12} />} {enabled ? t("on") : t("off")}
            </span>
          </span>
        </div>

        {enabled ? (
          <div className="space-y-3">
            {required ? (
              <p className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-subtle"><Lock size={14} /> {t("requiredNote")}</p>
            ) : (
              <>
                <p className="text-[12.5px] text-subtle">{t("disable")}</p>
                {codeInput(disable, t("disable"), true)}
              </>
            )}
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

      {/* سياسة الشركة (إلزام MFA) — لأصحاب صلاحية الإعدادات */}
      {canManageOrg ? (
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink"><Lock size={15} className="text-primary" /> {t("orgTitle")}</div>
          <p className="mb-3 text-[12px] text-subtle">{t("orgSubtitle")}</p>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
            <span className="text-[12.5px] font-medium text-ink">{t("orgToggle")}</span>
            <input type="checkbox" checked={orgRequired} onChange={(e) => saveOrg(e.target.checked)} className="h-4 w-4 accent-primary" />
          </label>
        </section>
      ) : null}

      {/* الاحتفاظ بالبيانات والإتلاف الآمن (PDPL) — لأصحاب صلاحية الإعدادات */}
      {canManageOrg ? (
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink"><ShieldOff size={15} className="text-primary" /> {t("retentionTitle")}</div>
          <p className="mb-3 text-[12px] text-subtle">{t("retentionSubtitle")}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">{t("retentionLabel")}</span>
              <input type="number" min={1} max={30} value={retentionYears} onChange={(e) => setRetentionYears(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                className="h-10 w-28 rounded-lg border border-line bg-card px-3 text-center text-[15px] tnum text-ink" />
            </label>
            <button onClick={saveRetention} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-ink px-4 text-[13px] font-semibold text-white hover:opacity-90">{t("retentionSave")}</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
