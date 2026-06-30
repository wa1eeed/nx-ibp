"use client";

import { useState, type FormEvent } from "react";
import { Building2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { api, setToken, ApiError } from "@/lib/api";

export default function SignupPage() {
  const t = useTranslations("signup");
  const router = useRouter();
  const [form, setForm] = useState({ companyName: "", companyNameEn: "", crNumber: "", adminName: "", adminEmail: "", password: "", planCode: "basic" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // الحقول الاختيارية الفارغة تُحذف لتجاوز تحقّق الصيغة (مثل السجل التجاري)
      const payload: Record<string, string> = { companyName: form.companyName, adminName: form.adminName, adminEmail: form.adminEmail, password: form.password, planCode: form.planCode };
      if (form.companyNameEn.trim()) payload.companyNameEn = form.companyNameEn.trim();
      if (form.crNumber.trim()) payload.crNumber = form.crNumber.trim();
      const res = await api<{ accessToken: string }>("/signup", { method: "POST", body: JSON.stringify(payload) });
      setToken(res.accessToken);
      router.push("/tenant/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  const field = "h-10 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  const label = "mb-1 block text-[12.5px] font-medium text-muted";

  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4 py-8">
      <div className="w-full max-w-md rounded-card border border-line bg-card p-6 shadow-card">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-fg">
            <Building2 size={22} />
          </div>
          <h1 className="text-lg font-bold text-ink">{t("title")}</h1>
          <p className="text-[12.5px] text-subtle">{t("subtitle")}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className={label}>{t("company")}</span>
            <input value={form.companyName} onChange={set("companyName")} required minLength={2} className={field} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={label}>{t("companyEn")}</span>
              <input value={form.companyNameEn} onChange={set("companyNameEn")} dir="ltr" className={field} />
            </label>
            <label className="block">
              <span className={label}>{t("cr")}</span>
              <input value={form.crNumber} onChange={set("crNumber")} inputMode="numeric" dir="ltr" className={field} />
            </label>
          </div>
          <label className="block">
            <span className={label}>{t("adminName")}</span>
            <input value={form.adminName} onChange={set("adminName")} required minLength={2} className={field} />
          </label>
          <label className="block">
            <span className={label}>{t("email")}</span>
            <input type="email" value={form.adminEmail} onChange={set("adminEmail")} required dir="ltr" className={field} />
          </label>
          <label className="block">
            <span className={label}>{t("password")}</span>
            <input type="password" value={form.password} onChange={set("password")} required minLength={8} className={field} />
            <span className="mt-1 block text-[11px] text-subtle">{t("passwordHint")}</span>
          </label>
          <label className="block">
            <span className={label}>{t("plan")}</span>
            <select value={form.planCode} onChange={set("planCode")} className={field}>
              <option value="basic">{t("planBasic")}</option>
              <option value="premium">{t("planPremium")}</option>
              <option value="enterprise">{t("planEnterprise")}</option>
            </select>
          </label>

          {error ? <p className="text-[12.5px] font-medium text-danger">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary-strong text-[13px] font-semibold text-primary-fg transition-colors hover:bg-primary disabled:opacity-60"
          >
            <Sparkles size={16} />
            {loading ? "…" : t("submit")}
          </button>
          <p className="text-center text-[12px] text-subtle">
            {t("haveAccount")} <Link href="/login" className="font-semibold text-primary hover:underline">{t("loginLink")}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
