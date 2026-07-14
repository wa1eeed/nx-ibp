"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, ApiError, setPortalToken } from "@/lib/api";

interface InviteInfo { email: string; fullName: string; clientName: string; activated: boolean }

function ActivateInner() {
  const t = useTranslations("portal.activate");
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { setInvalid(true); return; }
    void api<InviteInfo>(`/portal/invite/${token}`).then(setInfo).catch(() => setInvalid(true));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError(t("weak")); return; }
    if (password !== confirm) { setError(t("mismatch")); return; }
    setLoading(true);
    try {
      const res = await api<{ accessToken: string }>("/portal/activate", { method: "POST", body: JSON.stringify({ token, password }) });
      setPortalToken(res.accessToken);
      router.push("/portal/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("invalidLink"));
      setLoading(false);
    }
  }

  const field = "h-10 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-6 shadow-card">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-primary text-white"><ShieldCheck size={22} /></div>
          <h1 className="text-lg font-bold text-ink">{t("title")}</h1>
          <p className="text-[12.5px] text-subtle">{t("subtitle")}</p>
        </div>
        {invalid ? (
          <p className="rounded-lg bg-danger-soft/50 px-3 py-3 text-center text-[12.5px] font-medium text-danger">{t("invalidLink")}</p>
        ) : !info ? (
          <p className="py-6 text-center text-[13px] text-subtle">…</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-center">
              <p className="text-[13px] font-semibold text-ink">{t("welcome", { name: info.fullName })}</p>
              <p className="text-[11.5px] text-subtle">{t("forClient", { client: info.clientName })} · <span className="tnum">{info.email}</span></p>
            </div>
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("password")}</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={field} /></label>
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("confirm")}</span><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={field} /></label>
            {error ? <p className="text-[12.5px] font-medium text-danger">{error}</p> : null}
            <button type="submit" disabled={loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
              <KeyRound size={16} /> {loading ? "…" : t("submit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function PortalActivatePage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-bg text-subtle">…</div>}>
      <ActivateInner />
    </Suspense>
  );
}
