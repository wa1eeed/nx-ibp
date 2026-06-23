"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, setPlatformToken } from "@/lib/api";

export default function AdminLoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("admin@ibp-platform.sa");
  const [password, setPassword] = useState("Passw0rd!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api<{ accessToken: string }>("/platform/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setPlatformToken(res.accessToken);
      router.push("/admin/usage");
    } catch {
      setError(t("admin.login.error"));
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
          {error ? <p className="text-[12.5px] font-medium text-danger">{error}</p> : null}
          <button type="submit" disabled={loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-ink text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
            <LogIn size={16} /> {loading ? "…" : t("admin.login.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
