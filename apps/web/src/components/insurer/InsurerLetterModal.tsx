"use client";

import { useEffect, useState } from "react";
import { X, Send, Eye, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";

interface Letter { to: string | null; insurerName: string | null; subject: string; body: string }

/**
 * حوار مراسلة شركة التأمين — يجلب الصيغة الافتراضية من `${base}/insurer-letter`، يتيح تحرير
 * المستلِم/الموضوع/النصّ + CC + معاينة، ثم يرسل عبر `${base}/send-insurer`.
 * يُستخدم في تفاصيل طلب الخدمة (base=/service-requests/:id) وتفاصيل المطالبة (base=/claims/:id).
 */
export function InsurerLetterModal({ base, onClose, onSent }: { base: string; onClose: () => void; onSent?: () => void }) {
  const t = useTranslations("insurerLetter");
  const [to, setTo] = useState("");
  const [insurerName, setInsurerName] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ccText, setCcText] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void api<Letter>(`${base}/insurer-letter`).then((l) => {
      setTo(l.to ?? ""); setInsurerName(l.insurerName); setSubject(l.subject); setBody(l.body);
    }).catch(() => undefined);
  }, [base]);

  const cc = ccText.split(/[,\s;]+/).map((s) => s.trim()).filter((s) => /.+@.+\..+/.test(s));

  async function send() {
    setBusy(true); setError("");
    try {
      const res = await api<{ ok: boolean; to: string; insurer: string | null }>(`${base}/send-insurer`, {
        method: "POST", body: JSON.stringify({ to: to.trim() || undefined, subject: subject.trim() || undefined, body: body.trim() || undefined, cc: cc.length ? cc : undefined }),
      });
      setDone(res.to);
      setTimeout(() => { onSent?.(); onClose(); }, 1300);
    } catch (err) { setError(err instanceof ApiError ? err.message : t("error")); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-card border border-line bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Mail size={17} className="text-primary" /> {t("title")}{insurerName ? ` — ${insurerName}` : ""}</h2>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-ink"><X size={16} /></button>
        </div>

        {done ? (
          <div className="rounded-lg bg-success-soft px-3 py-3 text-[12.5px] font-medium text-success">✓ {t("sent", { to: done })}</div>
        ) : preview ? (
          <div className="space-y-2 rounded-lg border border-line bg-surface-2/40 p-3 text-[12.5px]">
            <div><span className="text-subtle">{t("to")}:</span> <span className="font-medium text-ink">{to || "—"}</span></div>
            {cc.length ? <div><span className="text-subtle">CC:</span> <span className="font-medium text-ink">{cc.join("، ")}</span></div> : null}
            <div><span className="text-subtle">{t("subject")}:</span> <span className="font-medium text-ink">{subject}</span></div>
            <div className="whitespace-pre-wrap border-t border-line pt-2 text-ink">{body}</div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("to")}</span>
              <input value={to} onChange={(e) => setTo(e.target.value)} type="email" placeholder="insurer@example.com" className="h-9 w-full rounded-lg border border-line bg-bg px-3 text-[13px]" /></label>
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">CC ({t("optional")})</span>
              <input value={ccText} onChange={(e) => setCcText(e.target.value)} placeholder="a@x.com, b@y.com" className="h-9 w-full rounded-lg border border-line bg-bg px-3 text-[13px]" /></label>
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("subject")}</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-bg px-3 text-[13px]" /></label>
            <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("body")}</span>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-[13px] leading-relaxed" /></label>
          </div>
        )}

        {error ? <p className="mt-2 text-[12px] font-medium text-danger">{error}</p> : null}

        {!done ? (
          <div className="mt-4 flex items-center justify-between">
            <button onClick={() => setPreview((p) => !p)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2"><Eye size={14} /> {preview ? t("backEdit") : t("preview")}</button>
            <div className="flex gap-2">
              <button onClick={onClose} className="h-9 rounded-lg border border-line px-4 text-[12.5px] text-muted hover:bg-surface-2">{t("cancel")}</button>
              <button onClick={() => void send()} disabled={busy || !subject.trim() || !body.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><Send size={14} /> {busy ? "…" : t("send")}</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
