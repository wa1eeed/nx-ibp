"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DatabaseZap, Download, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { papi, ApiError } from "@/lib/api";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/ui/PageHeader";

interface Meta { count: number; source: string | null }

// أعمدة القالب بالترتيب — بأسماء الداتاست العربية التي يتعرّف عليها الاستيراد (رقم السجل واسم السجل إلزاميان)
const COLUMNS = ["رقم السجل", "الرقم الموحد", "اسم السجل", "نوع النشاط التجاري (بالعربية)", "الكيان القانوني", "تاريخ انشاء السجل", "المنطقة", "المدينة", "رأس المال", "نوع السجل"];
const EXAMPLE = ["4030000005", "7000000005", "شركة مثال للتجارة", "تجارة التجزئة", "شركة ذات مسؤولية محدودة", "2020-01-15", "مكة المكرمة", "جدة", "500000", "رئيسي"];
const CHUNK = 2000; // صفوف لكل طلب — يبقى تحت حدّ جسم الطلب (2mb)

/** مُحلّل CSV صغير يحترم الاقتباس المزدوج والفواصل والأسطر داخل الحقول المقتبسة. */
function parseCsv(text: string): Record<string, string>[] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0].trim() === "") continue; // سطر فارغ
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (cells[idx] ?? "").trim(); });
    out.push(obj);
  }
  return out;
}

/** بناء CSV مع BOM (UTF-8) ليفتح في Excel بعربية سليمة. */
function toCsv(rows: string[][]): string {
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export default function AdminCrRegistryPage() {
  const t = useTranslations();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ imported: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMeta = useCallback(() => { void papi<Meta>("/platform/cr-registry/meta").then(setMeta).catch(() => undefined); }, []);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  function downloadTemplate() {
    const csv = toCsv([COLUMNS, EXAMPLE]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "cr-registry-template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setResult(null); setProgress(""); setBusy(true);
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error(t("admin.crRegistry.emptyFile"));
      const source = `manual_${file.name.replace(/\.[^.]+$/, "").slice(0, 80)}`;
      let imported = 0, total = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const r = await papi<{ imported: number; total: number }>("/platform/cr-registry/import", { method: "POST", body: JSON.stringify({ rows: chunk, source }) });
        imported += r.imported; total = r.total;
        setProgress(t("admin.crRegistry.progress", { done: Math.min(i + CHUNK, rows.length), all: rows.length }));
      }
      setResult({ imported, total });
      loadMeta();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const nf = (n: number) => n.toLocaleString("en-US");

  return (
    <AdminShell>
      <PageHeader title={t("admin.crRegistry.title")} subtitle={t("admin.crRegistry.subtitle")} />

      {/* اللقطة الحالية */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-card p-5 shadow-card">
          <div className="mb-1 flex items-center gap-2 text-primary"><DatabaseZap size={18} /><span className="text-[12px] font-medium text-subtle">{t("admin.crRegistry.records")}</span></div>
          <div className="text-[26px] font-bold text-ink tnum">{meta ? nf(meta.count) : "…"}</div>
        </div>
        <div className="rounded-card border border-line bg-card p-5 shadow-card">
          <div className="mb-1 flex items-center gap-2 text-muted"><FileSpreadsheet size={18} /><span className="text-[12px] font-medium text-subtle">{t("admin.crRegistry.source")}</span></div>
          <div className="text-[15px] font-semibold text-ink" dir="ltr">{meta?.source ?? t("admin.crRegistry.unknown")}</div>
        </div>
      </div>

      {/* الخطوات */}
      <div className="mb-5 rounded-card border border-line bg-info-soft/40 p-4 text-[13px] text-ink">
        <div className="mb-2 flex items-center gap-2 font-semibold text-info"><Info size={16} /> {t("admin.crRegistry.howtoTitle")}</div>
        <ol className="list-decimal space-y-1 pe-5">
          <li>{t("admin.crRegistry.step1")}</li>
          <li>{t("admin.crRegistry.step2")}</li>
          <li>{t("admin.crRegistry.step3")}</li>
        </ol>
      </div>

      {/* القالب + الرفع */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-card p-5 shadow-card">
          <h3 className="mb-1 text-[14px] font-semibold text-ink">{t("admin.crRegistry.templateTitle")}</h3>
          <p className="mb-3 text-[12.5px] text-muted">{t("admin.crRegistry.templateHint")}</p>
          <button onClick={downloadTemplate} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface-2/40 px-4 text-[13px] font-semibold text-ink hover:bg-surface-2"><Download size={16} /> {t("admin.crRegistry.downloadTemplate")}</button>
          <div className="mt-3 flex flex-wrap gap-1">
            {COLUMNS.map((c) => <span key={c} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-subtle">{c}</span>)}
          </div>
        </div>

        <div className="rounded-card border border-line bg-card p-5 shadow-card">
          <h3 className="mb-1 text-[14px] font-semibold text-ink">{t("admin.crRegistry.uploadTitle")}</h3>
          <p className="mb-3 text-[12.5px] text-muted">{t("admin.crRegistry.uploadHint")}</p>
          <label className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary ${busy ? "pointer-events-none opacity-60" : ""}`}>
            <Upload size={16} /> {busy ? t("admin.crRegistry.uploading") : t("admin.crRegistry.chooseFile")}
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy} className="hidden" />
          </label>
          {progress ? <p className="mt-3 text-[12.5px] text-muted tnum">{progress}</p> : null}
          {result ? (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success"><CheckCircle2 size={15} className="shrink-0" /> {t("admin.crRegistry.done", { imported: nf(result.imported), total: nf(result.total) })}</p>
          ) : null}
          {error ? <p className="mt-3 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger"><AlertTriangle size={15} className="shrink-0" /> {error}</p> : null}
        </div>
      </div>
    </AdminShell>
  );
}
