/**
 * استيراد لقطة السجل التجاري من ملفّ **TSV مضغوط** (‎.tsv.gz‎) مضمَّن في المستودع/الصورة.
 * سريع وخفيف الذاكرة (بثّ gunzip سطرًا سطرًا + createMany بالدُّفعات). يُستدعى تلقائيًّا من الـentrypoint.
 *
 * الأعمدة (Tab-separated، بالترتيب):
 *   crNumber · unifiedNumber · name · activity · legalEntity · registryType · region · city · capital · issueDate
 *
 * الاستخدام:  node prisma/import-cr-tsv.cjs <file.tsv.gz> [--replace] [--if-below N] [--source <label>]
 *   --replace        يمسح كل السجلات قبل التحميل.
 *   --if-below N      لا يستورد إن كان عدد السجلات الحالي ≥ N (فيمرّ فورًا على النشرات التالية).
 *   --source <label>  وسم اللقطة (افتراضي opendata_mc_2026q1).
 */
const fs = require("node:fs");
const zlib = require("node:zlib");
const readline = require("node:readline");
const { PrismaClient, Prisma } = require("../generated/client");

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--if-below" && args[i - 1] !== "--source");
  const replace = args.includes("--replace");
  const ib = args.indexOf("--if-below");
  const ifBelow = ib !== -1 ? Number(args[ib + 1]) : null;
  const si = args.indexOf("--source");
  const source = si !== -1 ? args[si + 1] : "opendata_mc_2026q1";
  if (!file || !fs.existsSync(file)) { console.error(`الملف غير موجود: ${file}`); process.exit(1); }

  if (ifBelow != null) {
    const count = await prisma.crRegistryRecord.count();
    if (count >= ifBelow) { console.log(`السجل التجاري: ${count.toLocaleString("en-US")} سجلًّا محمّلة مسبقًا (≥ ${ifBelow}) — تخطٍّ.`); await prisma.$disconnect(); return; }
  }
  if (replace) { const del = await prisma.crRegistryRecord.deleteMany({}); console.log(`مُسح ${del.count.toLocaleString("en-US")} سجلًّا.`); }

  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  let batch = [];
  let total = 0;
  const flush = async () => { if (!batch.length) return; const d = batch; batch = []; await prisma.crRegistryRecord.createMany({ data: d, skipDuplicates: true }); };
  for await (const line of rl) {
    if (!line) continue;
    const c = line.split("\t");
    const cr = (c[0] || "").trim();
    const name = (c[2] || "").trim();
    if (!cr || !name) continue;
    const cap = c[8] ? Number(c[8]) : null;
    const issue = c[9] ? new Date(c[9]) : null;
    batch.push({
      crNumber: cr,
      unifiedNumber: c[1] || null,
      name,
      activity: c[3] || null,
      legalEntity: c[4] || null,
      registryType: c[5] || null,
      region: c[6] || null,
      city: c[7] || null,
      capital: cap != null && !isNaN(cap) ? new Prisma.Decimal(cap) : null,
      issueDate: issue && !isNaN(issue.getTime()) ? issue : null,
      status: "active",
      source,
    });
    total++;
    if (batch.length >= 2000) { await flush(); if (total % 200000 === 0) console.log(`   … ${total.toLocaleString("en-US")}`); }
  }
  await flush();
  const count = await prisma.crRegistryRecord.count();
  console.log(`تمّ تحميل السجل التجاري: ${total.toLocaleString("en-US")} سجلًّا · إجمالي الجدول: ${count.toLocaleString("en-US")} · المصدر: ${source}`);
  await prisma.$disconnect();
}

void main().catch((e) => { console.error(e); process.exit(1); });
