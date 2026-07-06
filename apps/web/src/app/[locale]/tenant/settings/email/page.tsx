"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, ShieldCheck, Clock, AlertTriangle, Copy, Check, RefreshCw, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";

interface DnsRecord { record?: string; name: string; type: string; value: string; status?: string; priority?: number }
interface EmailSettings {
  fromEmail: string | null; fromName: string | null; domain: string | null;
  apiKeyMasked: string | null; hasApiKey: boolean;
  verificationStatus: string; sendingMode: string;
  dnsRecords: DnsRecord[]; lastVerifiedAt: string | null; fallbackFrom: string;
}

const STATUS_TONE: Record<string, string> = {
  verified: "bg-success-soft text-success",
  pending: "bg-warning-soft text-warning",
  failed: "bg-danger/10 text-danger",
  unconfigured: "bg-surface-2 text-subtle",
};

export default function TenantEmailPage() {
  const t = useTranslations("tenantEmail");
  const [s, setS] = useState<EmailSettings | null>(null);
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const data = await api<EmailSettings>("/config/email");
    setS(data);
    setFromEmail(data.fromEmail ?? "");
    setFromName(data.fromName ?? "");
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setError(""); setNotice(""); setBusy(true);
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : t("error")); } finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const body: Record<string, string> = { fromEmail, fromName };
    if (apiKey.trim()) body.apiKey = apiKey.trim();
    await api("/config/email", { method: "PUT", body: JSON.stringify(body) });
    setApiKey(""); setNotice(t("saved")); await load();
  });
  const verify = () => run(async () => { await api("/config/email/verify", { method: "POST" }); setNotice(t("verifyDone")); await load(); });

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500); } catch { /* ignore */ }
  };

  const status = s?.verificationStatus ?? "unconfigured";
  const inFallback = (s?.sendingMode ?? "fallback") === "fallback";
  const field = "h-10 w-full rounded-lg border border-line bg-card px-3 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Mail size={20} /></div>
        <div><h1 className="text-lg font-bold text-ink">{t("title")}</h1><p className="text-[12.5px] text-subtle">{t("subtitle")}</p></div>
      </header>

      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      {notice ? <p className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{notice}</p> : null}

      {/* شريط وضع fallback */}
      {s && inFallback && s.hasApiKey ? (
        <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-[12.5px] font-medium text-warning">
          <Clock size={16} className="mt-0.5 shrink-0" /> {t("fallbackBanner", { from: s.fallbackFrom })}
        </p>
      ) : null}

      {/* نموذج الإعداد */}
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-ink">{t("configTitle")}</h2>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status]}`}>
            {status === "verified" ? <ShieldCheck size={12} /> : status === "pending" ? <Clock size={12} /> : status === "failed" ? <AlertTriangle size={12} /> : null}
            {t(`status.${status}`)}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted">{t("fromEmail")}</span>
            <input dir="ltr" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="noreply@yourbroker.sa" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted">{t("fromName")}</span>
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder={t("fromNamePh")} className={field} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[12px] font-medium text-muted">{t("apiKey")} {s?.hasApiKey ? <span className="text-subtle">· {s.apiKeyMasked}</span> : null}</span>
            <input dir="ltr" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={s?.hasApiKey ? t("apiKeyKeep") : "re_••••••••"} className={`${field} font-mono`} />
            <span className="mt-1 block text-[11px] text-subtle">{t("apiKeyHint")}</span>
          </label>
        </div>
        <button onClick={save} disabled={busy || !fromEmail || !fromName}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">
          <Link2 size={16} /> {t("saveConnect")}
        </button>
      </section>

      {/* بطاقة النطاق + سجلّات DNS */}
      {s && s.dnsRecords.length > 0 ? (
        <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
            <div>
              <h2 className="text-[14px] font-semibold text-ink">{t("dnsTitle")}</h2>
              <p className="text-[12px] text-subtle">{t("dnsSubtitle", { domain: s.domain ?? "" })}</p>
            </div>
            <button onClick={verify} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-[12.5px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-60">
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> {t("verifyNow")}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-[12.5px]" dir="ltr">
              <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-4 py-2.5 text-start font-semibold">{t("dns.type")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("dns.name")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("dns.value")}</th>
                <th className="px-4 py-2.5"></th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {s.dnsRecords.map((r, i) => (
                  <tr key={i} className="hover:bg-surface-2/60 align-top">
                    <td className="px-4 py-2.5 font-semibold text-ink">{r.type}</td>
                    <td className="px-4 py-2.5 break-all font-mono text-muted">{r.name}</td>
                    <td className="px-4 py-2.5 break-all font-mono text-muted">{r.value}</td>
                    <td className="px-4 py-2.5 text-end">
                      <button onClick={() => copy(r.value, `v${i}`)} title={t("copy")} className="rounded-md border border-line p-1.5 text-subtle hover:bg-surface-2 hover:text-ink">
                        {copied === `v${i}` ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
