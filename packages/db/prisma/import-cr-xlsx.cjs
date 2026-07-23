/**
 * استيراد ملفّات «البيانات المفتوحة» للسجلات التجارية (وزارة التجارة) بصيغة Excel (.xlsx) إلى CrRegistryRecord.
 * يبثّ ورقة العمل عبر `unzip -p` (يتحمّل ملفّات بمئات الميغابايت وملايين الصفوف بذاكرة منخفضة)،
 * ويُدرِج دُفعاتٍ بـ createMany (skipDuplicates). الأعمدة العربية تُطابَق بالترويسة.
 *
 * الاستخدام:  node prisma/import-cr-xlsx.cjs <file1.xlsx> [file2.xlsx ...] [--fresh] [--source <label>]
 *   --fresh          يمسح الجدول قبل الاستيراد (تحميل لقطة نظيفة).
 *   --source <label> وسم اللقطة الزمنية (افتراضي opendata_mc_2026q1).
 */
const { spawn } = require("node:child_process");
const { PrismaClient, Prisma } = require("../generated/client");

const prisma = new PrismaClient();

// تعيين ترويسات الداتاست العربية ⇒ حقول النموذج
const FIELD_BY_HEADER = {
  "رقم السجل": "crNumber",
  "الرقم الموحد": "unifiedNumber",
  "الرقم الموحّد": "unifiedNumber",
  "اسم السجل": "name",
  "نوع النشاط التجاري (بالعربية)": "activity",
  "نوع النشاط التجاري": "activity",
  "الكيان القانوني": "legalEntity",
  "نوع السجل": "registryType",
  "المنطقة": "region",
  "المدينة": "city",
  "رأس المال": "capital",
  "تاريخ انشاء السجل": "issueDate",
  "تاريخ إنشاء السجل": "issueDate",
};

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const normCr = (s) => String(s || "").replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/\D/g, "");
const decode = (s) =>
  String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** يستخرج قيم خلايا صفّ واحد ⇒ خريطة {colLetter: value}. */
function parseRow(rowXml) {
  const out = {};
  const cellRe = /<c\s+r="([A-Z]+)\d+"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m;
  while ((m = cellRe.exec(rowXml))) {
    const col = m[1];
    const inner = m[2];
    if (inner == null) continue;
    const ts = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
    if (ts) { out[col] = decode(ts[1]); continue; }
    const v = inner.match(/<v>([\s\S]*?)<\/v>/);
    if (v) out[col] = decode(v[1]);
  }
  return out;
}

function toRecord(cells, headerByCol, source) {
  const row = {};
  for (const [col, val] of Object.entries(cells)) {
    const field = headerByCol[col];
    if (field) row[field] = val;
  }
  const cr = normCr(row.crNumber);
  if (!cr || !row.name) return null;
  const cap = row.capital != null ? Number(String(row.capital).replace(/[^\d.]/g, "")) : null;
  const issue = row.issueDate ? new Date(row.issueDate) : null;
  return {
    crNumber: cr,
    unifiedNumber: row.unifiedNumber ? normCr(row.unifiedNumber) : null,
    name: String(row.name).trim(),
    activity: row.activity ?? null,
    legalEntity: row.legalEntity ?? null,
    registryType: row.registryType ?? null,
    region: row.region ?? null,
    city: row.city ?? null,
    capital: cap != null && !isNaN(cap) ? new Prisma.Decimal(cap) : null,
    issueDate: issue && !isNaN(issue.getTime()) ? issue : null,
    status: "active",
    source,
  };
}

function importFile(file, source) {
  return new Promise((resolve, reject) => {
    const child = spawn("unzip", ["-p", file, "xl/worksheets/sheet1.xml"], { stdio: ["ignore", "pipe", "ignore"] });
    let buf = "";
    let headerByCol = null;
    let batch = [];
    let total = 0;
    let paused = false;
    const flush = async () => {
      if (!batch.length) return;
      const data = batch; batch = [];
      await prisma.crRegistryRecord.createMany({ data, skipDuplicates: true });
    };
    const pump = async () => {
      // استخرج كل الصفوف المكتملة من المخزن
      let idx;
      while ((idx = buf.indexOf("</row>")) !== -1) {
        const start = buf.lastIndexOf("<row", idx);
        const rowXml = start !== -1 ? buf.slice(start, idx + 6) : "";
        buf = buf.slice(idx + 6);
        if (!rowXml) continue;
        const cells = parseRow(rowXml);
        if (!headerByCol) {
          headerByCol = {};
          for (const [col, txt] of Object.entries(cells)) { const f = FIELD_BY_HEADER[String(txt).trim()]; if (f) headerByCol[col] = f; }
          continue; // صفّ الترويسة
        }
        const rec = toRecord(cells, headerByCol, source);
        if (rec) { batch.push(rec); total++; }
        if (batch.length >= 2000) {
          child.stdout.pause(); paused = true;
          try { await flush(); } catch (e) { child.kill(); return reject(e); }
          if (total % 100000 < 2000) console.log(`   … ${total.toLocaleString("en-US")} سجلًّا`);
          child.stdout.resume(); paused = false;
        }
      }
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { buf += chunk; if (!paused) void pump(); });
    child.stdout.on("end", async () => { try { await pump(); await flush(); resolve(total); } catch (e) { reject(e); } });
    child.on("error", reject);
  });
}

module.exports = { importFile, toRecord, parseRow, normCr, decode, FIELD_BY_HEADER, prisma };

async function main() {
  const args = process.argv.slice(2);
  const fresh = args.includes("--fresh");
  const si = args.indexOf("--source");
  const source = si !== -1 ? args[si + 1] : "opendata_mc_2026q1";
  const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--source");
  if (!files.length) { console.error("الاستخدام: node prisma/import-cr-xlsx.cjs <file1.xlsx> [file2.xlsx …] [--fresh] [--source <label>]"); process.exit(1); }

  if (fresh) { const del = await prisma.crRegistryRecord.deleteMany({}); console.log(`مُسح ${del.count.toLocaleString("en-US")} سجلًّا قديمًا.`); }
  let grand = 0;
  for (const f of files) {
    console.log(`استيراد: ${f}`);
    const n = await importFile(f, source);
    console.log(`   ✓ ${n.toLocaleString("en-US")} سجلًّا من ${f}`);
    grand += n;
  }
  const count = await prisma.crRegistryRecord.count();
  console.log(`تمّ. المُدرَج هذه المرّة: ${grand.toLocaleString("en-US")} · إجمالي الجدول: ${count.toLocaleString("en-US")} · المصدر: ${source}`);
  await prisma.$disconnect();
}

if (require.main === module) void main().catch((e) => { console.error(e); process.exit(1); });
