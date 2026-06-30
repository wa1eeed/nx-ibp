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

echo "[entrypoint] إقلاع الـ API على المنفذ ${API_PORT:-4000}..."
cd /app/apps/api
exec node dist/main.js
