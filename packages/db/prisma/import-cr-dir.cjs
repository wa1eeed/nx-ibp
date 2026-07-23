/**
 * مزامنة مجلد «السجلات التجارية» — تجلب المنصّة بيانات السجلات من **مجلد مخصّص** (drop folder):
 * ضع ملفّات اللقطة (`.xlsx`/`.csv`) في المجلد؛ عند التشغيل يُستورَد **الجديد فقط** (يُتخطّى ما استُورد سابقًا
 * بمطابقة الاسم+الحجم+زمن التعديل عبر جدول CrRegistryImport)، فإضافة شركات جديدة = إسقاط ملفّ جديد في المجلد.
 *
 * الاستخدام:  node prisma/import-cr-dir.cjs [dir] [--fresh] [--source <label>]
 *   dir              المجلد (افتراضي: $CR_REGISTRY_DIR أو data/cr-registry).
 *   --fresh          يمسح كل السجلات + سِجِلّ الاستيراد ثم يعيد استيراد كل الملفّات (لقطة نظيفة/فصلية).
 *   --source <label> وسم اللقطة (افتراضي opendata_mc).
 * يُوصى بربطه بمهمّة مجدولة (cron) ليجلب الملفّات الجديدة آليًّا. يتطلّب `unzip` للـxlsx.
 */
const fs = require("node:fs");
const path = require("node:path");
const { importFile, prisma } = require("./import-cr-xlsx.cjs");

const DEFAULT_DIR = process.env.CR_REGISTRY_DIR || path.resolve(__dirname, "../../..", "data/cr-registry");

async function main() {
  const args = process.argv.slice(2);
  const fresh = args.includes("--fresh");
  const si = args.indexOf("--source");
  const source = si !== -1 ? args[si + 1] : "opendata_mc";
  const dir = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--source") || DEFAULT_DIR;

  if (!fs.existsSync(dir)) { console.error(`المجلد غير موجود: ${dir}`); process.exit(1); }
  const files = fs.readdirSync(dir).filter((f) => /\.(xlsx|csv)$/i.test(f)).sort();
  if (!files.length) { console.log(`لا ملفّات (.xlsx/.csv) في ${dir}`); await prisma.$disconnect(); return; }

  if (fresh) {
    const del = await prisma.crRegistryRecord.deleteMany({});
    await prisma.crRegistryImport.deleteMany({});
    console.log(`--fresh: مُسح ${del.count.toLocaleString("en-US")} سجلًّا + سِجِلّ الاستيراد.`);
  }

  let imported = 0, skipped = 0;
  for (const name of files) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    const already = await prisma.crRegistryImport.findFirst({ where: { fileName: name, fileSize: BigInt(st.size), mtimeMs: BigInt(Math.round(st.mtimeMs)) } });
    if (already) { console.log(`⏭️  متطابق (مستورَد سابقًا): ${name}`); skipped++; continue; }
    if (!/\.xlsx$/i.test(name)) { console.log(`⚠️  ${name}: CSV غير مدعوم في مزامنة المجلد — استخدم import-cr-registry.ts. تخطٍّ.`); skipped++; continue; }
    console.log(`⬇️  استيراد: ${name} (${(st.size / 1e6).toFixed(0)}MB)`);
    const rows = await importFile(full, source);
    await prisma.crRegistryImport.create({ data: { fileName: name, fileSize: BigInt(st.size), mtimeMs: BigInt(Math.round(st.mtimeMs)), rows, source } });
    console.log(`   ✓ ${rows.toLocaleString("en-US")} سجلًّا`);
    imported++;
  }
  const count = await prisma.crRegistryRecord.count();
  console.log(`تمّت المزامنة. ملفّات مُستورَدة: ${imported} · متخطّاة: ${skipped} · إجمالي الجدول: ${count.toLocaleString("en-US")}`);
  await prisma.$disconnect();
}

void main().catch((e) => { console.error(e); process.exit(1); });
