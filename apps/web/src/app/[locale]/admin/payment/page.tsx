"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, KeyRound, ExternalLink, FlaskConical, Zap, ShieldCheck, Save, Check, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { papi, ApiError } from "@/lib/api";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/ui/PageHeader";

interface PlatformPayment {
  provider: string;
  mode: "test" | "live";
  enabled: boolean;
  merchantId: string | null;
  testPublicKey: string | null;
  hasTestSecret: boolean;
  livePublicKey: string | null;
  hasLiveSecret: boolean;
}

const TAP_DOCS = "https://developers.tap.company/reference/api-endpoint";

export default function AdminPaymentPage() {
  const t = useTranslations("adminPayment");
  const [s, setS] = useState<PlatformPayment | null>(null);
  const [mode, setMode] = useState<"test" | "live">("test");
  const [enabled, setEnabled] = useState(false);
  const [merchantId, setMerchantId] = useState("");
  const [testPublicKey, setTestPublicKey] = useState("");
  const [testSecretKey, setTestSecretKey] = useState("");
  const [livePublicKey, setLivePublicKey] = useState("");
  const [liveSecretKey, setLiveSecretKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const data = await papi<PlatformPayment>("/platform/payment");
    setS(data);
    setMode(data.mode);
    setEnabled(data.enabled);
    setMerchantId(data.merchantId ?? "");
    setTestPublicKey(data.testPublicKey ?? "");
    setLivePublicKey(data.livePublicKey ?? "");
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  const save = async () => {
    setError(""); setNotice("");
    // تحقّق من صيغة المفاتيح حسب الوضع قبل الإرسال (مطابق للخادم)
    const tpk = testPublicKey.trim(), tsk = testSecretKey.trim(), lpk = livePublicKey.trim(), lsk = liveSecretKey.trim();
    if (tpk && !/^pk_test_/.test(tpk)) { setError(t("badTestPublic")); return; }
    if (tsk && !/^sk_test_/.test(tsk)) { setError(t("badTestSecret")); return; }
    if (lpk && !/^pk_live_/.test(lpk)) { setError(t("badLivePublic")); return; }
    if (lsk && !/^sk_live_/.test(lsk)) { setError(t("badLiveSecret")); return; }
    // لا تفعيل لوضع بلا مفتاحيه (عام محفوظ/مُدخَل + سرّي محفوظ/مُدخَل)
    if (enabled) {
      const havePub = mode === "live" ? (lpk || s?.livePublicKey) : (tpk || s?.testPublicKey);
      const haveSec = mode === "live" ? (lsk || s?.hasLiveSecret) : (tsk || s?.hasTestSecret);
      if (!havePub || !haveSec) { setError(t("enableNeedsKeys", { mode: t(`mode.${mode}`) })); return; }
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { mode, enabled, merchantId: merchantId.trim(), testPublicKey: tpk, livePublicKey: lpk };
      if (tsk) body.testSecretKey = tsk;
      if (lsk) body.liveSecretKey = lsk;
      await papi("/platform/payment", { method: "PUT", body: JSON.stringify(body) });
      setTestSecretKey(""); setLiveSecretKey(""); setNotice(t("saved")); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : t("error")); }
    finally { setBusy(false); }
  };

  const field = "h-10 w-full rounded-lg border border-line bg-card px-3 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <AdminShell>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="mx-auto max-w-2xl space-y-5 pb-10">
        {/* شريط الحالة: الوضع الفعّال + التفعيل */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${mode === "live" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
            {mode === "live" ? <Zap size={13} /> : <FlaskConical size={13} />} {t(`mode.${mode}`)}
          </span>
          {s?.enabled ? <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-[11.5px] font-medium text-success"><ShieldCheck size={13} /> {t("active")}</span>
            : <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-subtle">{t("inactive")}</span>}
          <a href={TAP_DOCS} target="_blank" rel="noopener noreferrer" className="ms-auto inline-flex items-center gap-1 text-[12px] text-primary hover:underline">{t("apiDocs")} <ExternalLink size={12} /></a>
        </div>

        <div className="rounded-card border border-line bg-card p-5 shadow-card">
          {/* مبدّل الوضع: اختبار ⇄ حيّ (يحدّد المفتاح الفعّال لفوترة الاشتراكات) */}
          <label className="mb-1.5 block text-[12.5px] font-semibold text-ink">{t("activeMode")}</label>
          <div className="grid grid-cols-2 gap-2">
            {(["test", "live"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`inline-flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-[13px] font-semibold transition-colors ${mode === m ? (m === "live" ? "border-success bg-success-soft/50 text-success" : "border-warning bg-warning-soft/50 text-warning") : "border-line bg-card text-muted hover:bg-surface-2"}`}>
                {m === "live" ? <Zap size={15} /> : <FlaskConical size={15} />} {t(`mode.${m}`)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">{t("activeModeHint")}</p>

          {/* Merchant ID */}
          <div className="mt-5 border-t border-line pt-4">
            <label className="block sm:w-64"><span className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-muted"><Store size={13} /> {t("merchantId")}</span>
              <input value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder="3xxxxxxx" className={`${field} tnum`} /></label>
            <p className="mt-1 text-[11px] text-subtle">{t("merchantIdHint")}</p>
          </div>

          {/* مفاتيح الاختبار */}
          <div className="mt-5 space-y-3 border-t border-line pt-4">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-warning"><FlaskConical size={15} /> {t("testKeys")}</div>
            <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{t("publicKey")}</span>
              <input value={testPublicKey} onChange={(e) => setTestPublicKey(e.target.value)} placeholder="pk_test_..." className={`${field} tnum`} /></label>
            <label className="block"><span className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-muted"><KeyRound size={13} /> {t("secretKey")}</span>
              <input type="password" value={testSecretKey} onChange={(e) => setTestSecretKey(e.target.value)} placeholder={s?.hasTestSecret ? `•••••••• (${t("keySet")})` : "sk_test_..."} className={`${field} tnum`} />
              <span className="mt-1 block text-[11px] text-subtle">{t("secretHint")}</span></label>
          </div>

          {/* مفاتيح الإنتاج (الحيّ) */}
          <div className="mt-5 space-y-3 border-t border-line pt-4">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-success"><Zap size={15} /> {t("liveKeys")}</div>
            <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{t("publicKey")}</span>
              <input value={livePublicKey} onChange={(e) => setLivePublicKey(e.target.value)} placeholder="pk_live_..." className={`${field} tnum`} /></label>
            <label className="block"><span className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-muted"><KeyRound size={13} /> {t("secretKey")}</span>
              <input type="password" value={liveSecretKey} onChange={(e) => setLiveSecretKey(e.target.value)} placeholder={s?.hasLiveSecret ? `•••••••• (${t("keySet")})` : "sk_live_..."} className={`${field} tnum`} />
              <span className="mt-1 block text-[11px] text-subtle">{t("secretHint")}</span></label>
          </div>

          {/* التفعيل */}
          <label className="mt-5 flex items-center gap-2.5 rounded-lg bg-surface-2 px-3 py-2.5">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-primary" />
            <span className="text-[12.5px] text-ink">{t("enable")}</span>
            <span className="text-[11px] text-subtle">— {t("enableHint")}</span>
          </label>

          {error ? <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
          {notice ? <p className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{notice}</p> : null}
          <div className="mt-4 flex justify-end">
            <button onClick={save} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary-strong px-5 text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">
              {notice ? <Check size={16} /> : <Save size={16} />} {busy ? "…" : t("save")}
            </button>
          </div>
        </div>

        <p className="rounded-lg bg-info-soft/50 px-4 py-3 text-[11.5px] leading-relaxed text-info"><CreditCard size={13} className="mb-0.5 me-1 inline" /> {t("securityNote")}</p>
      </div>
    </AdminShell>
  );
}
