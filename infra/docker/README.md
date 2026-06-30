# Docker (مساعد)

- **التطوير المحلي:** `docker-compose.yml` بالجذر (postgres + redis + api + web).
- **الإنتاج (Coolify):** [`docker-compose.coolify.yml`](./docker-compose.coolify.yml) + دليل [`coolify.md`](./coolify.md) — حزمة كاملة بفحوص صحّة، أسرار إلزامية (fail-fast)، وهجرات تلقائية.
- صور الخدمات في `apps/*/Dockerfile`. صورة الـ API تستخدم [`apps/api/docker-entrypoint.sh`](../../apps/api/docker-entrypoint.sh): تطبّق `prisma migrate deploy` ثم تُقلع (عطّلها بـ `SKIP_MIGRATIONS=true`).
- بديل Kubernetes في [`infra/k8s`](../k8s/README.md).
