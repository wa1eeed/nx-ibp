#!/bin/sh
# نقطة دخول صورة الـ API: تطبّق هجرات Prisma ثم تُقلع الخادم.
# - الهجرات idempotent (migrate deploy) — آمنة على كل إقلاع لنسخة واحدة.
# - عطّلها بـ SKIP_MIGRATIONS=true عند نشر متعدد النسخ (شغّلها كـ Job/initContainer منفصل).
set -e

if [ "$SKIP_MIGRATIONS" != "true" ]; then
  echo "[entrypoint] تطبيق هجرات قاعدة البيانات (prisma migrate deploy)..."
  (cd /app && pnpm --filter @ibp/db run migrate:deploy:prod)
else
  echo "[entrypoint] تخطّي الهجرات (SKIP_MIGRATIONS=true)."
fi

# بذرة اختيارية عند الإقلاع (بعد الهجرات). اضبط SEED_ON_START في Coolify ثم أعد النشر مرّة واحدة:
#   SEED_ON_START=demo        ⇒ بيانات ديمو كاملة (الهيكل القياسي + الحسابات التجريبية) — للـ staging
#   SEED_ON_START=production  ⇒ بذرة إنتاج دُنيا (بلا بيانات ديمو)
# البذرة idempotent (upserts) وتمسّ حسابات الديمو المعرّفة فقط، لا حسابات العملاء الحقيقية.
# بعد نجاحها أزِل المتغيّر (وإلا أُعيد البذر عند كل إقلاع). التعطيل الافتراضي: غير مضبوط.
if [ -n "$SEED_ON_START" ]; then
  echo "[entrypoint] بذر البيانات (SEED_ON_START=$SEED_ON_START)..."
  if [ "$SEED_ON_START" = "production" ]; then
    (cd /app && pnpm --filter @ibp/db run seed:prod) || echo "[entrypoint] ⚠ فشلت البذرة — يتابع الإقلاع."
  else
    (cd /app && pnpm --filter @ibp/db run seed:demo) || echo "[entrypoint] ⚠ فشلت البذرة — يتابع الإقلاع."
  fi
fi

# مزامنة لقطة السجل التجاري (البيانات المفتوحة — وزارة التجارة) من مجلد مُثبَّت (volume) — اختياري.
# اضبط CR_REGISTRY_DIR على مسار المجلد الذي رفعت فيه ملفّات اللقطة (.xlsx)، ثم أعد النشر.
#   - idempotent: يستورد الملفّات الجديدة فقط (يتخطّى المستورَد سابقًا عبر جدول التتبّع) — سريع بعد أول تحميل.
#   - CR_REGISTRY_FRESH=true ⇒ لقطة فصلية نظيفة (يمسح ثم يعيد الاستيراد الكامل).
#   - يتطلّب unzip (مثبّت في الصورة). فشلُه لا يوقف الإقلاع.
if [ -n "$CR_REGISTRY_DIR" ] && [ -d "$CR_REGISTRY_DIR" ]; then
  echo "[entrypoint] مزامنة السجل التجاري من $CR_REGISTRY_DIR ..."
  CR_FRESH=""
  [ "$CR_REGISTRY_FRESH" = "true" ] && CR_FRESH="--fresh"
  (cd /app && node packages/db/prisma/import-cr-dir.cjs "$CR_REGISTRY_DIR" $CR_FRESH) || echo "[entrypoint] ⚠ فشلت مزامنة السجل التجاري — يتابع الإقلاع."
fi

echo "[entrypoint] إقلاع الـ API على المنفذ ${API_PORT:-4000}..."
cd /app/apps/api
exec node dist/main.js
