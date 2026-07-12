"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Plus, Trash2, BookmarkPlus, Upload, Download } from "lucide-react";
import { useLocale } from "next-intl";
import type { BlockDef, FieldDef, FieldOption, SectionDef } from "@ibp/shared";
import { blockTemplateCsv, parseBlockCsv, type CsvImportResult } from "@/lib/block-csv";

export interface FormSchemaData {
  sections: SectionDef[];
  blocks: BlockDef[];
}
export interface FormPayload {
  base: Record<string, unknown>;
  blocks: Record<string, Array<Record<string, unknown>>>;
}

const SPAN: Record<number, string> = { 1: "sm:col-span-1", 2: "sm:col-span-2", 3: "sm:col-span-3", 4: "sm:col-span-4" };

export function DynamicForm({
  schema,
  submitting,
  error,
  onSubmit,
  initialBase,
  initialBlocks,
  onSaveTemplate,
}: {
  schema: FormSchemaData;
  submitting?: boolean;
  error?: string;
  onSubmit: (payload: FormPayload) => void;
  initialBase?: Record<string, unknown>;
  initialBlocks?: Record<string, Array<Record<string, unknown>>>;
  onSaveTemplate?: (payload: FormPayload) => void;
}) {
  const locale = useLocale();
  const ar = locale === "ar";
  const label = (x: { labelAr: string; labelEn: string }) => (ar ? x.labelAr : x.labelEn);
  const optLabel = (o: FieldOption) => (ar ? o.labelAr : o.labelEn);

  // القيم الأولية (من قالب محفوظ عند وجوده) — يُعاد بناؤها عند تغيّر مفتاح المكوّن.
  const [base, setBase] = useState<Record<string, unknown>>(() => ({ currency: "SAR", ...(initialBase ?? {}) }));
  const [blocks, setBlocks] = useState<Record<string, Array<Record<string, unknown>>>>(() => {
    const def = Object.fromEntries(schema.blocks.map((b) => [b.key, Array.from({ length: Math.max(1, b.min ?? 0) }, () => ({}))]));
    if (initialBlocks) for (const b of schema.blocks) { const rows = initialBlocks[b.key]; if (Array.isArray(rows) && rows.length) def[b.key] = rows.map((r) => ({ ...r })); }
    return def;
  });

  const errorList = useMemo(() => (error ? error.split(" | ") : []), [error]);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ base, blocks });
  }

  function setBlockField(key: string, idx: number, field: string, value: unknown) {
    setBlocks((prev) => {
      const rows = [...(prev[key] ?? [])];
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...prev, [key]: rows };
    });
  }
  function addRow(key: string) {
    setBlocks((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), {}] }));
  }
  function removeRow(key: string, idx: number) {
    setBlocks((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((_, i) => i !== idx) }));
  }

  // ——— الاستيراد الجماعي من CSV (للأساطيل/المجموعات الكبيرة) ———
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [imports, setImports] = useState<Record<string, CsvImportResult>>({});

  function downloadTemplate(block: BlockDef) {
    const blob = new Blob([blockTemplateCsv(block, ar)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${block.key}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImportFile(block: BlockDef, file: File) {
    const text = await file.text();
    const result = parseBlockCsv(block, text, ar);
    if (result.rows.length) {
      setBlocks((prev) => {
        const existing = prev[block.key] ?? [];
        // استبدل الصفوف الأولية الفارغة؛ وإلا ألحِق الصفوف المستوردة
        const nonEmpty = existing.filter((r) => Object.keys(r).length > 0);
        return { ...prev, [block.key]: [...nonEmpty, ...result.rows] };
      });
    }
    setImports((prev) => ({ ...prev, [block.key]: result }));
  }

  function renderField(f: FieldDef, value: unknown, onChange: (v: unknown) => void, keyPrefix: string) {
    const common = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
    const id = `${keyPrefix}.${f.key}`;
    let input;
    if (f.type === "select") {
      input = (
        <select id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={common}>
          <option value="">—</option>
          {(f.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{optLabel(o)}</option>
          ))}
        </select>
      );
    } else if (f.type === "textarea") {
      input = <textarea id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={`${common} h-20 py-2`} />;
    } else {
      const htmlType = f.type === "date" ? "date" : ["number", "currency", "percent"].includes(f.type) ? "number" : "text";
      input = (
        <input
          id={id}
          type={htmlType}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(htmlType === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
          className={common}
        />
      );
    }
    return (
      <label key={f.key} className={`block ${SPAN[f.span ?? 1]}`}>
        <span className="mb-1 block text-[12px] font-medium text-muted">
          {label(f)} {f.required ? <span className="text-danger">*</span> : null}
        </span>
        {input}
      </label>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* الأقسام الأساسية */}
      {schema.sections.map((s) => (
        <section key={s.key} className="rounded-card border border-line bg-card p-5 shadow-card">
          <h3 className="mb-3 text-[14px] font-semibold text-ink">{label({ labelAr: s.titleAr, labelEn: s.titleEn })}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {s.fields.map((f) => renderField(f, base[f.key], (v) => setBase((p) => ({ ...p, [f.key]: v })), "base"))}
          </div>
        </section>
      ))}

      {/* الكتل المتكررة */}
      {schema.blocks.map((b) => (
        <section key={b.key} className="rounded-card border border-line bg-card p-5 shadow-card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-ink">{label({ labelAr: b.titleAr, labelEn: b.titleEn })}</h3>
            <div className="flex items-center gap-1.5">
              {/* استيراد جماعي: تنزيل قالب CSV ثم رفعه (للأساطيل/المجموعات) */}
              <button type="button" onClick={() => downloadTemplate(b)} title={label({ labelAr: "تنزيل قالب CSV", labelEn: "Download CSV template" })}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2 py-1.5 text-[11.5px] font-medium text-muted transition-colors hover:bg-surface-2">
                <Download size={13} /> {label({ labelAr: "قالب", labelEn: "Template" })}
              </button>
              <input ref={(el) => { fileRefs.current[b.key] = el; }} type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportFile(b, f); e.target.value = ""; }} />
              <button type="button" onClick={() => fileRefs.current[b.key]?.click()} title={label({ labelAr: "استيراد من CSV", labelEn: "Import from CSV" })}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2 py-1.5 text-[11.5px] font-medium text-muted transition-colors hover:bg-surface-2">
                <Upload size={13} /> {label({ labelAr: "استيراد CSV", labelEn: "Import CSV" })}
              </button>
              <button type="button" onClick={() => addRow(b.key)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-surface-2">
                <Plus size={14} /> {label({ labelAr: `إضافة ${b.itemLabelAr}`, labelEn: `Add ${b.itemLabelEn}` })}
              </button>
            </div>
          </div>
          {/* نتيجة الاستيراد الجماعي */}
          {imports[b.key] ? (
            <div className="mb-3 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-[12px]">
              {imports[b.key].rows.length ? <p className="font-medium text-success">{ar ? `أُضيف ${imports[b.key].rows.length} صفًّا من الملف` : `Imported ${imports[b.key].rows.length} rows`}</p> : null}
              {imports[b.key].errors.length ? (
                <details className="mt-1">
                  <summary className="cursor-pointer font-medium text-danger">{ar ? `${imports[b.key].errors.length} صفًّا به أخطاء (لم تُضَف)` : `${imports[b.key].errors.length} rows with errors (skipped)`}</summary>
                  <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto ps-4 text-[11px] text-danger">{imports[b.key].errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </details>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-3">
            {(blocks[b.key] ?? []).map((row, idx) => (
              <div key={idx} className="rounded-lg border border-line bg-surface-2/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11.5px] font-medium text-subtle">{label({ labelAr: b.itemLabelAr, labelEn: b.itemLabelEn })} #{idx + 1}</span>
                  {(blocks[b.key]?.length ?? 0) > (b.min ?? 0) ? (
                    <button type="button" onClick={() => removeRow(b.key, idx)} className="text-subtle transition-colors hover:text-danger">
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  {b.fields.map((f) => renderField(f, row[f.key], (v) => setBlockField(b.key, idx, f.key, v), `${b.key}.${idx}`))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {errorList.length ? (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-[12.5px] text-danger">
          <ul className="list-disc space-y-0.5 ps-4">{errorList.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        {onSaveTemplate ? (
          <button
            type="button"
            onClick={() => onSaveTemplate({ base, blocks })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-4 py-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2"
          >
            <BookmarkPlus size={15} /> {label({ labelAr: "حفظ كقالب", labelEn: "Save as template" })}
          </button>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-5 py-2.5 text-[13px] font-semibold text-primary-fg transition-colors hover:bg-primary disabled:opacity-60"
        >
          {submitting ? "…" : label({ labelAr: "إنشاء الطلب", labelEn: "Create request" })}
        </button>
      </div>
    </form>
  );
}
