/**
 * استيراد ملفّ «البيانات المفتوحة» للسجلات التجارية (وزارة التجارة) إلى جدول CrRegistryRecord.
 * الداتاست: https://open.data.gov.sa/ar/datasets/view/aef772cd-354c-48bb-9819-c60706dc8b56
 *
 * الاستخدام:  ts-node prisma/import-cr-registry.ts <path/to/file.csv> [source-label]
 *   - نزّل ملفّ اللقطة من الرابط أعلاه وصدّره CSV بترميز UTF-8 (الأعمدة العربية كما هي).
 *   - source-label اختياري (افتراضي opendata_mc_2026q1) لتمييز اللقطة الزمنية.
 */
import { readFileSync } from "node:fs";
import { PrismaClient, Prisma } from "../generated/client";

const prisma = new PrismaClient();

/** محلّل CSV بسيط يدعم الحقول المقتبسة (") والفواصل داخلها. */
function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // إزالة BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* تجاهل */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift()?.map((h) => h.trim()) ?? [];
  return rows.filter((r) => r.some((v) => v.trim() !== "")).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const ar = "٠١٢٣٤٥٦٧٨٩";
const normCr = (s: string) => (s || "").replace(/[٠-٩]/g, (d) => String(ar.indexOf(d))).replace(/\D/g, "");
const pick = (row: Record<string, string>, keys: string[]) => { for (const k of keys) { const v = row[k]; if (v && v.trim()) return v.trim(); } return null; };

async function main() {
  const file = process.argv[2];
  const source = process.argv[3] || "opendata_mc_2026q1";
  if (!file) { console.error("الاستخدام: ts-node prisma/import-cr-registry.ts <file.csv> [source]"); process.exit(1); }
  const rows = parseCsv(readFileSync(file, "utf8"));
  let imported = 0, skipped = 0;
  for (const row of rows) {
    const cr = normCr(pick(row, ["رقم السجل", "crNumber"]) ?? "");
    const name = pick(row, ["اسم السجل", "name"]);
    if (!cr || !name) { skipped++; continue; }
    const capRaw = pick(row, ["رأس المال", "capital"]);
    const cap = capRaw ? Number(capRaw.replace(/[^\d.]/g, "")) : null;
    const issueRaw = pick(row, ["تاريخ انشاء السجل", "تاريخ إنشاء السجل", "issueDate"]);
    const issue = issueRaw ? new Date(issueRaw) : null;
    const data = {
      name,
      unifiedNumber: pick(row, ["الرقم الموحد", "الرقم الموحّد"]),
      activity: pick(row, ["نوع النشاط التجاري (بالعربية)", "نوع النشاط التجاري"]),
      legalEntity: pick(row, ["الكيان القانوني"]),
      issueDate: issue && !isNaN(issue.getTime()) ? issue : null,
      region: pick(row, ["المنطقة"]),
      city: pick(row, ["المدينة"]),
      capital: cap !== null && !isNaN(cap) ? new Prisma.Decimal(cap) : null,
      registryType: pick(row, ["نوع السجل"]),
      status: "active",
      source,
      importedAt: new Date(),
    };
    await prisma.crRegistryRecord.upsert({ where: { crNumber: cr }, update: data, create: { crNumber: cr, ...data } });
    imported++;
    if (imported % 5000 === 0) console.log(`… ${imported} سجلًّا`);
  }
  console.log(`تمّ الاستيراد: ${imported} سجلًّا (تخطّي ${skipped}) — المصدر: ${source}`);
  await prisma.$disconnect();
}

void main();
