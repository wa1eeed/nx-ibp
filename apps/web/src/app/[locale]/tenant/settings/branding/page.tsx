"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Palette, Upload, Check, Image as ImageIcon, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";
import { applyBranding, type Branding } from "@/components/branding/BrandingProvider";

const DEFAULT_PRIMARY = "#0d9488";
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function TenantBrandingPage() {
  const t = useTranslations("tenantBranding");
  const [b, setB] = useState<Branding | null>(null);
  const [primary, setPrimary] = useState(DEFAULT_PRIMARY);
  const [displayName, setDisplayName] = useState("");
  const [logoText, setLogoText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const data = await api<Branding>("/branding");
    setB(data);
    setPrimary(data.primary || DEFAULT_PRIMARY);
    setDisplayName(data.displayName ?? "");
    setLogoText(data.logoText ?? "");
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setError(""); setNotice(""); setBusy(true);
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : t("error")); } finally { setBusy(false); }
  };

  const save = () => run(async () => {
    if (!HEX_RE.test(primary)) { setError(t("badColor")); return; }
    const next = await api<{ ok: true } & Branding>("/config/branding", {
      method: "PUT",
      body: JSON.stringify({ primary, displayName, logoText }),
    });
    setNotice(t("saved"));
    applyBranding(next); // انعكاس فوري على كامل الواجهة
    await load();
  });

  const onPickLogo = () => fileRef.current?.click();
  const onLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) { setError(t("logoTooBig")); return; }
    const reader = new FileReader();
    reader.onload = () => run(async () => {
      const dataUrl = String(reader.result);
      const next = await api<{ ok: true } & Branding>("/config/branding/logo", { method: "POST", body: JSON.stringify({ dataUrl }) });
      setNotice(t("logoSaved"));
      applyBranding(next);
      await load();
    });
    reader.readAsDataURL(file);
  };

  const reset = () => { setPrimary(DEFAULT_PRIMARY); setDisplayName(""); setLogoText(""); };
  const field = "h-10 w-full rounded-lg border border-line bg-card px-3 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  const previewFg = "#ffffff";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Palette size={20} /></div>
        <div><h1 className="text-lg font-bold text-ink">{t("title")}</h1><p className="text-[12.5px] text-subtle">{t("subtitle")}</p></div>
      </header>

      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      {notice ? <p className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{notice}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {/* المحرّر */}
        <section className="space-y-4 rounded-card border border-line bg-card p-5 shadow-card">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted">{t("displayName")}</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("displayNamePh")} maxLength={60} className={field} />
          </label>

          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted">{t("logoText")}</span>
            <input value={logoText} onChange={(e) => setLogoText(e.target.value)} placeholder="IBP" maxLength={24} className={field} />
          </label>

          <div>
            <span className="mb-1 block text-[12px] font-medium text-muted">{t("primary")}</span>
            <div className="flex items-center gap-2">
              <input type="color" value={HEX_RE.test(primary) ? primary : DEFAULT_PRIMARY} onChange={(e) => setPrimary(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-card p-1" />
              <input dir="ltr" value={primary} onChange={(e) => setPrimary(e.target.value)} className={`${field} font-mono`} />
            </div>
          </div>

          <div>
            <span className="mb-1 block text-[12px] font-medium text-muted">{t("logo")}</span>
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-surface-2">
                {b?.logoUrl ? <img src={b.logoUrl} alt="logo" className="max-h-12 max-w-12 object-contain" /> : <ImageIcon size={20} className="text-subtle" />}
              </div>
              <button onClick={onPickLogo} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-card px-3 text-[13px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-60">
                <Upload size={15} /> {t("uploadLogo")}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" onChange={onLogoChange} className="hidden" />
            </div>
            <span className="mt-1 block text-[11px] text-subtle">{t("logoHint")}</span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button onClick={save} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">
              <Check size={16} /> {t("save")}
            </button>
            <button onClick={reset} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">
              <RotateCcw size={14} /> {t("reset")}
            </button>
          </div>
        </section>

        {/* معاينة حيّة */}
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-subtle">{t("preview")}</div>
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="flex items-center gap-2 px-4 py-3" style={{ background: HEX_RE.test(primary) ? primary : DEFAULT_PRIMARY }}>
              {b?.logoUrl ? <img src={b.logoUrl} alt="logo" className="max-h-6" /> : <span className="text-[15px] font-bold" style={{ color: previewFg }}>{logoText || displayName || "IBP"}</span>}
            </div>
            <div className="space-y-3 p-4">
              <div className="text-[13px] font-semibold text-ink">{displayName || t("previewHeadline")}</div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 items-center rounded-lg px-4 text-[13px] font-semibold" style={{ background: HEX_RE.test(primary) ? primary : DEFAULT_PRIMARY, color: previewFg }}>{t("previewBtn")}</span>
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: HEX_RE.test(primary) ? `${primary}22` : "#0d948822", color: HEX_RE.test(primary) ? primary : DEFAULT_PRIMARY }}>{t("previewBadge")}</span>
              </div>
              <div className="h-2 w-3/4 rounded-full" style={{ background: HEX_RE.test(primary) ? `${primary}33` : "#0d948833" }} />
              <div className="h-2 w-1/2 rounded-full bg-surface-2" />
            </div>
          </div>
          <p className="mt-3 text-[11.5px] text-subtle">{t("previewNote")}</p>
        </section>
      </div>
    </div>
  );
}
