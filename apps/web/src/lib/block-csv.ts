// استيراد جماعي لصفوف الكتل المتكررة (مركبات/أعضاء/أرواح…) من ملف CSV.
// يحوّل ملفًا إلى صفوف مُتحقَّق منها ضد مخطّط الكتلة (BlockDef) قبل تعبئة النموذج —
// يغني عن الإدخال صفًّا صفًّا للأساطيل والمجموعات الكبيرة. بلا أي مكتبة خارجية.
import type { BlockDef, FieldDef } from "@ibp/shared";

/** مُحلِّل CSV بسيط ومتين: يدعم الاقتباس، الفواصل داخل الاقتباس، وأسطر CRLF/LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // إزالة BOM إن وُجد (ملفات Excel المُصدَّرة CSV)
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch === "\r") { /* تجاهل */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  // إسقاط الأسطر الفارغة تمامًا
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** يبني قالب CSV للكتلة: صف عناوين (تسميات الحقول، والمطلوب مُعلَّم بـ*). */
export function blockTemplateCsv(block: BlockDef, ar: boolean): string {
  const header = block.fields.map((f) => `${ar ? f.labelAr : f.labelEn}${f.required ? " *" : ""}`);
  return "﻿" + header.map(csvCell).join(",") + "\r\n"; // BOM ليفتح Excel العربية بترميز صحيح
}

/** يطابق عنوان عمود CSV بحقلٍ في الكتلة (بالتسمية العربية/الإنجليزية أو المفتاح). */
function fieldForHeader(header: string, fields: FieldDef[]): FieldDef | undefined {
  const h = header.replace(/\s*\*\s*$/, "").trim().toLowerCase();
  return fields.find((f) => [f.labelAr, f.labelEn, f.key].some((x) => x.trim().toLowerCase() === h));
}

/** يطابق قيمة خيار select (بالقيمة أو التسمية). */
function matchOption(field: FieldDef, raw: string): string | undefined {
  const v = raw.trim().toLowerCase();
  const opt = (field.options ?? []).find((o) => [o.value, o.labelAr, o.labelEn].some((x) => x.trim().toLowerCase() === v));
  return opt?.value;
}

export interface CsvImportResult {
  rows: Array<Record<string, unknown>>; // الصفوف الصحيحة الجاهزة للتعبئة
  errors: string[]; // أخطاء لكل صف/عمود
  skipped: number; // صفوف فيها أخطاء لم تُضَف
}

/**
 * يحلّل CSV ويتحقّق كل صفّ ضد مخطّط الكتلة. الصفوف الصحيحة تُرجَع للتعبئة،
 * والصفوف بها أخطاء تُوصَف بدقّة (رقم الصف + الحقل + سبب الخطأ) ولا تُضَف.
 */
export function parseBlockCsv(block: BlockDef, text: string, ar: boolean): CsvImportResult {
  const grid = parseCsv(text);
  if (grid.length < 1) return { rows: [], errors: [ar ? "الملف فارغ" : "Empty file"], skipped: 0 };

  const headers = grid[0];
  const mapped = headers.map((h) => fieldForHeader(h, block.fields));
  if (!mapped.some(Boolean)) {
    return { rows: [], errors: [ar ? "لم يُطابَق أي عمود مع حقول النموذج — استخدم القالب" : "No column matched the form fields — use the template"], skipped: 0 };
  }

  const rows: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  const lbl = (f: FieldDef) => (ar ? f.labelAr : f.labelEn);

  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    const obj: Record<string, unknown> = {};
    const rowErrors: string[] = [];

    mapped.forEach((field, c) => {
      if (!field) return;
      const raw = (cells[c] ?? "").trim();
      if (raw === "") return; // فارغ ⇒ يُترك (يُفحص المطلوب لاحقًا)
      if (field.type === "select") {
        const v = matchOption(field, raw);
        if (v === undefined) rowErrors.push(`${lbl(field)}: «${raw}» ${ar ? "قيمة غير مسموحة" : "invalid option"}`);
        else obj[field.key] = v;
      } else if (["number", "currency", "percent"].includes(field.type)) {
        const n = Number(raw.replace(/,/g, ""));
        if (Number.isNaN(n)) rowErrors.push(`${lbl(field)}: «${raw}» ${ar ? "ليس رقمًا" : "not a number"}`);
        else obj[field.key] = n;
      } else if (field.type === "boolean") {
        obj[field.key] = ["yes", "true", "1", "نعم", "صح"].includes(raw.toLowerCase());
      } else if (field.type === "nationalId") {
        if (!/^\d{10}$/.test(raw)) rowErrors.push(`${lbl(field)}: «${raw}» ${ar ? "الهوية 10 أرقام" : "ID must be 10 digits"}`);
        else obj[field.key] = raw;
      } else obj[field.key] = raw;
    });

    // فحص الحقول المطلوبة
    for (const f of block.fields) {
      if (f.required && (obj[f.key] === undefined || obj[f.key] === "")) {
        rowErrors.push(`${lbl(f)}: ${ar ? "مطلوب" : "required"}`);
      }
    }

    if (rowErrors.length) errors.push(`${ar ? "الصف" : "Row"} ${r}: ${rowErrors.join(" · ")}`);
    else rows.push(obj);
  }

  return { rows, errors, skipped: errors.length };
}
