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

# تحميل لقطة السجل التجاري (البيانات المفتوحة — وزارة التجارة) — **تلقائيًّا وبلا أيّ إعداد**.
# اللقطة مضمَّنة في المستودع/الصورة (ملفّ tsv.gz صغير). يُحمَّل **مرّة واحدة** عند أول نشر:
# إن كان الجدول شبه فارغ (< 100000) يُستورَد، وإلا يُتخطّى فورًا (لا يبطئ النشرات التالية). فشلُه لا يوقف الإقلاع.
CR_BUNDLE=/app/packages/db/data/cr-registry/cr_2026q1.tsv.gz
if [ -f "$CR_BUNDLE" ]; then
  echo "[entrypoint] تحميل لقطة السجل التجاري (إن لزم)..."
  (cd /app && node packages/db/prisma/import-cr-tsv.cjs "$CR_BUNDLE" --replace --if-below 100000) || echo "[entrypoint] ⚠ فشل تحميل السجل التجاري — يتابع الإقلاع."
fi

echo "[entrypoint] إقلاع الـ API على المنفذ ${API_PORT:-4000}..."
cd /app/apps/api
exec node dist/main.js
