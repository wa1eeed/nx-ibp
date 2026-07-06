"use client";

import { useState } from "react";
import { X, Check, Headset } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";

const onlyDigits = (s: string, max: number) => s.replace(/\D/g, "").slice(0, max);

/** نموذج «تواصل معنا» لطلبات مبيعات الباقات الكبيرة — يرسل Lead عامًّا. */
export function ContactSalesModal({ planCode, onClose }: { planCode?: string; onClose: () => void }) {
  const t = useTranslations("contact");
  const [f, setF] = useState({ name: "", company: "", email: "", phone: "", message: "" });
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const field = "h-10 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  const label = "mb-1 block text-[12px] font-medium text-muted";

  const phoneOk = f.phone === "" || /^05\d{8}$/.test(f.phone);
  const valid = f.name.trim().length >= 2 && /.+@.+\..+/.test(f.email) && phoneOk;

  async function submit() {
    if (!valid) return;
    setSaving(true); setErr("");
    try {
      await api("/signup/lead", { method: "POST", body: JSON.stringify({ name: f.name.trim(), email: f.email.trim(), company: f.company || undefined, phone: f.phone || undefined, message: f.message || undefined, planCode }) });
      setDone(true);
    } catch (e) { setErr(e instanceof ApiError ? e.message : t("error")); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-card border border-line bg-card p-6 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-[16px] font-bold text-ink"><Headset size={18} className="text-primary" /> {t("title")}</h2>
          <button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button>
        </div>

        {done ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success"><Check size={26} /></div>
            <p className="text-[14px] font-semibold text-ink">{t("thanks")}</p>
            <p className="mt-1 text-[12.5px] text-subtle">{t("thanksSub")}</p>
            <button onClick={onClose} className="mt-4 h-10 rounded-lg bg-primary-strong px-5 text-[13px] font-semibold text-primary-fg hover:bg-primary">{t("close")}</button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-[12.5px] text-subtle">{t("sub")}</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={label}>{t("name")} *</span><input value={f.name} onChange={set("name")} className={field} /></label>
                <label className="block"><span className={label}>{t("company")}</span><input value={f.company} onChange={set("company")} className={field} /></label>
              </div>
              <label className="block"><span className={label}>{t("email")} *</span><input type="email" value={f.email} onChange={set("email")} dir="ltr" className={field} /></label>
              <label className="block"><span className={label}>{t("phone")}</span><input value={f.phone} onChange={(e) => setF((p) => ({ ...p, phone: onlyDigits(e.target.value, 10) }))} inputMode="numeric" dir="ltr" maxLength={10} placeholder="05XXXXXXXX" className={`${field} ${f.phone && !phoneOk ? "border-danger ring-1 ring-danger/30" : ""}`} /></label>
              <label className="block"><span className={label}>{t("message")}</span><textarea value={f.message} onChange={set("message")} rows={3} className={`${field} h-auto py-2`} /></label>
              {err ? <p className="text-[12px] font-medium text-danger">{err}</p> : null}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={onClose} className="h-10 rounded-lg border border-line px-4 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("cancel")}</button>
                <button onClick={submit} disabled={saving || !valid} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary-strong px-5 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><Check size={15} /> {saving ? "…" : t("submit")}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
