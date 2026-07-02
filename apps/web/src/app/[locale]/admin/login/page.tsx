"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, setPlatformToken, ApiError } from "@/lib/api";

export default function AdminLoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("admin@ibp-platform.sa");
  const [password, setPassword] = useState("Passw0rd!");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const body = JSON.stringify({ email, password, ...(mfaRequired ? { mfaCode } : {}) });
      const res = await api<{ accessToken: string }>("/platform/login", { method: "POST", body });
      setPlatformToken(res.accessToken);
      router.push("/admin/usage");
    } catch (err) {
      if (err instanceof ApiError && err.message === "MFA_REQUIRED") {
        setMfaRequired(true); // اطلب رمز المصادقة الثنائية
      } else {
        setError(mfaRequired ? t("admin.mfa.wrong") : t("admin.login.error"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-6 shadow-card">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-ink text-white"><ShieldCheck size={22} /></div>
          <h1 className="text-lg font-bold text-ink">{t("admin.login.title")}</h1>
          <p className="text-[12.5px] text-subtle">{t("admin.subtitle")}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-10 w-full rounded-lg border border-line bg-card px-3 text-[13px]" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-10 w-full rounded-lg border border-line bg-card px-3 text-[13px]" />
          {mfaRequired ? (
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">{t("admin.mfa.loginCode")}</span>
              <input inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} required placeholder="000000" dir="ltr"
                className="h-10 w-full rounded-lg border border-line bg-card px-3 text-center text-[15px] tracking-widest tnum" />
              <span className="mt-1 block text-[11px] text-subtle">{t("admin.mfa.loginHint")}</span>
            </label>
          ) : null}
          {error ? <p className="text-[12.5px] font-medium text-danger">{error}</p> : null}
          <button type="submit" disabled={loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-ink text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
            <LogIn size={16} /> {loading ? "…" : t("admin.login.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
