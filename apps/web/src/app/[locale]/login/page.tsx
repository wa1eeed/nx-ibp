"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, setToken } from "@/lib/api";

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("waleed@gulf-demo.sa");
  const [password, setPassword] = useState("Passw0rd!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.accessToken);
      router.push("/tenant/settings/staff");
    } catch {
      setError(t("login.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-6 shadow-card">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-fg">
            <ShieldCheck size={22} />
          </div>
          <h1 className="text-lg font-bold text-ink">{t("login.title")}</h1>
          <p className="text-[12.5px] text-subtle">{t("login.subtitle")}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-muted">{t("login.email")}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-10 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-muted">{t("login.password")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-10 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          {error ? <p className="text-[12.5px] font-medium text-danger">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary-strong text-[13px] font-semibold text-primary-fg transition-colors hover:bg-primary disabled:opacity-60"
          >
            <LogIn size={16} />
            {loading ? "…" : t("login.submit")}
          </button>
          <p className="text-center text-[11px] text-subtle">{t("login.demoHint")}</p>
        </form>
      </div>
    </div>
  );
}
