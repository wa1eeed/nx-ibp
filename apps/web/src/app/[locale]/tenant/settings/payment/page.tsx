"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, ShieldCheck, KeyRound, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";

interface PaymentSettings {
  provider: "none" | "tap" | "moyasar";
  enabled: boolean;
  currency: string;
  publicKey: string | null;
  secretKeyMasked: string | null;
  hasSecret: boolean;
}

const PROVIDERS = [
  { key: "tap", docUrl: "https://developers.tap.company/reference/api-endpoint" },
  { key: "moyasar", docUrl: "https://docs.moyasar.com" },
] as const;

export default function TenantPaymentPage() {
  const t = useTranslations("tenantPayment");
  const [s, setS] = useState<PaymentSettings | null>(null);
  const [provider, setProvider] = useState<"none" | "tap" | "moyasar">("none");
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [currency, setCurrency] = useState("SAR");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const data = await api<PaymentSettings>("/config/payment");
    setS(data);
    setProvider(data.provider);
    setPublicKey(data.publicKey ?? "");
    setCurrency(data.currency ?? "SAR");
    setEnabled(data.enabled);
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  const save = async () => {
    setError(""); setNotice(""); setBusy(true);
    try {
      const body: Record<string, unknown> = { provider, publicKey, currency, enabled };
      if (secretKey.trim()) body.secretKey = secretKey.trim();
      await api("/config/payment", { method: "PUT", body: JSON.stringify(body) });
      setSecretKey(""); setNotice(t("saved")); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : t("error")); }
    finally { setBusy(false); }
  };

  const field = "h-10 w-full rounded-lg border border-line bg-card px-3 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  const activeDoc = PROVIDERS.find((p) => p.key === provider)?.docUrl;

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><CreditCard size={20} /></div>
        <div><h1 className="text-lg font-bold text-ink">{t("title")}</h1><p className="text-[12.5px] text-subtle">{t("subtitle")}</p></div>
        {s?.enabled ? <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-[11.5px] font-medium text-success"><ShieldCheck size={13} /> {t("active")}</span> : null}
      </div>

      <div className="rounded-card border border-line bg-card p-5 shadow-card">
        {/* اختيار البوّابة */}
        <label className="mb-1.5 block text-[12.5px] font-semibold text-ink">{t("gateway")}</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(["none", "tap", "moyasar"] as const).map((p) => (
            <button key={p} type="button" onClick={() => setProvider(p)}
              className={`rounded-xl border-2 px-3 py-2.5 text-center text-[13px] font-medium transition-colors ${provider === p ? "border-primary bg-primary-soft/40 text-primary" : "border-line bg-card text-muted hover:bg-surface-2"}`}>
              {t(`providers.${p}`)}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-subtle">{t("gatewayHint")}</p>

        {provider !== "none" ? (
          <div className="mt-5 space-y-3.5 border-t border-line pt-4">
            <div className="flex items-center gap-2 text-[12px] text-subtle"><KeyRound size={14} /> {t("keysFor", { provider: t(`providers.${provider}`) })}
              {activeDoc ? <a href={activeDoc} target="_blank" rel="noopener noreferrer" className="ms-auto inline-flex items-center gap-1 text-primary hover:underline">{t("apiDocs")} <ExternalLink size={12} /></a> : null}
            </div>
            <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{t("publicKey")}</span>
              <input value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder="pk_..." className={`${field} tnum`} /></label>
            <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{t("secretKey")}</span>
              <input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder={s?.hasSecret ? `•••••••• (${t("keySet")})` : "sk_..."} className={`${field} tnum`} />
              <span className="mt-1 block text-[11px] text-subtle">{t("secretHint")}</span></label>
            <label className="block sm:w-40"><span className="mb-1 block text-[12px] font-medium text-muted">{t("currency")}</span>
              <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} className={`${field} tnum`} /></label>
            <label className="flex items-center gap-2.5 rounded-lg bg-surface-2 px-3 py-2.5">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-primary" />
              <span className="text-[12.5px] text-ink">{t("enable")}</span>
              <span className="text-[11px] text-subtle">— {t("enableHint")}</span>
            </label>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-[12.5px] font-medium text-danger">{error}</p> : null}
        {notice ? <p className="mt-3 text-[12.5px] font-medium text-success">{notice}</p> : null}
        <div className="mt-4 flex justify-end">
          <button onClick={save} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary-strong px-5 text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">{busy ? "…" : t("save")}</button>
        </div>
      </div>

      <p className="rounded-lg bg-info-soft/50 px-4 py-3 text-[11.5px] leading-relaxed text-info">{t("securityNote")}</p>
    </div>
  );
}
