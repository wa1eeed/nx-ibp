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

echo "[entrypoint] إقلاع الـ API على المنفذ ${API_PORT:-4000}..."
cd /app/apps/api
exec node dist/main.js
