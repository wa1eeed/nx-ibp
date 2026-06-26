# 13 — التشغيل المحلي والعمليات (Local Setup & Operations)

> دليل تشغيل IBP محلياً خطوة بخطوة، أوامر الـ monorepo، الحاويات، والنقل السحابي. الحزمة: pnpm workspaces (Node 20)، PostgreSQL 16، Redis 7، Docker Compose.

## جدول المحتويات
- [1. المتطلّبات](#1-المتطلّبات)
- [2. التشغيل خطوة بخطوة](#2-التشغيل-خطوة-بخطوة)
- [3. أوامر pnpm](#3-أوامر-pnpm)
- [4. Docker Compose](#4-docker-compose)
- [5. التحقّق من النجاح](#5-التحقّق-من-النجاح)
- [6. النقل وحياد السحابة](#6-النقل-وحياد-السحابة)

## 1. المتطلّبات

Node ≥ 20 · pnpm ≥ 9 · Docker + Docker Compose · (psql اختياري للفحص). راجع [14 — متغيّرات البيئة](./14-environment-variables.md).

## 2. التشغيل خطوة بخطوة

```bash
# 1) المتغيّرات (لا أسرار في الكود)
cp .env.example .env

# 2) التبعيات
pnpm install

# 3) قاعدة البيانات و Redis فقط
pnpm infra:up                 # docker compose up -d postgres redis

# 4) عميل Prisma + الترحيل + بيانات وهمية
pnpm db:generate
pnpm db:migrate               # أو db:migrate:deploy لتطبيق migrations جاهزة
pnpm db:seed

# 5) الواجهة + الـ API
pnpm dev                      # web → :3000 ، api → :4000
```

> **ملاحظة محلية:** إن كانت المنافذ 5432/6379 مشغولة، عُدّلت في `.env` المحلي إلى **5434 (Postgres)** و**6381 (Redis)** — حدّث `DATABASE_URL`/`REDIS_URL` بما يطابقها.

## 3. أوامر pnpm

| الأمر | الوظيفة |
|---|---|
| `pnpm dev` | تشغيل web + api معاً |
| `pnpm dev:web` / `pnpm dev:api` | تشغيل واحدة |
| `pnpm build` | توليد عميل Prisma + بناء الكل |
| `pnpm typecheck` | فحص الأنواع لكل الحزم |
| `pnpm infra:up` / `infra:down` | postgres+redis فقط |
| `pnpm compose:up` / `compose:down` | الحزمة كاملةً بالحاويات (build) |
| `pnpm db:generate` | توليد عميل Prisma |
| `pnpm db:migrate` / `db:migrate:deploy` | ترحيل تطويري / تطبيق جاهز |
| `pnpm db:seed` | بيانات وهمية |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:reset` | إعادة ضبط + إعادة الزرع |
| `pnpm --filter @ibp/api test:e2e` | اختبارات التكامل (e2e) |

تفاصيل قاعدة البيانات في [15 — قاعدة البيانات والترحيلات](./15-database-and-migrations.md).

## 4. Docker Compose

[`docker-compose.yml`](../docker-compose.yml) يعرّف 4 خدمات:
- `postgres` (16-alpine) + `redis` (7-alpine) مع healthchecks وأحجام دائمة.
- `api` (يُبنى من [`apps/api/Dockerfile`](../apps/api/Dockerfile)) و`web` (من [`apps/web/Dockerfile`](../apps/web/Dockerfile)) — بناء متعدّد المراحل بـ pnpm.

تشغيل البنية فقط: `docker compose up -d postgres redis`. الحزمة كاملةً: `docker compose up -d --build`. المتغيّرات تُقرأ من `.env`.

## 5. التحقّق من النجاح

```bash
curl -s http://localhost:4000/health      # {"status":"ok","checks":{"database":"up","redis":"up"}}
open http://localhost:3000                  # يحوّل إلى /ar/tenant/dashboard
```
- الواجهة تفتح بالعربية (RTL) والإنجليزية.
- `/health` يردّ بحالة التبعيات. الترحيل ينجح والـ seed يُدخل بيانات وهمية فقط.

## 6. النقل وحياد السحابة

المعمار **حيادي سحابياً** (CLAUDE.md §2): Docker على Coolify (VPS) أولاً، ثم AWS/GCP/Alibaba بتغيير `.env` فقط:
- قاعدة البيانات: `DATABASE_URL`.
- التخزين: `STORAGE_DRIVER` (`s3`/`alibaba_oss`/`google_cloud_storage`/`minio`) + `STORAGE_*` — لا تغيير في الكود عند الانتقال من MinIO المحلي إلى S3.
- توطين الإنتاج (داخل المملكة) يشمل القاعدة **والنسخ الاحتياطية والسجلات والمرفقات** — انظر [17 — الامتثال](./17-compliance-and-regulatory.md).

> بنية النشر الإنتاجي (k8s/terraform) في [`infra/`](../infra) تُكتب في المرحلة 9.

## 7. استكشاف الأخطاء (مشاكل شائعة)

| العَرَض | السبب | الحل |
|---|---|---|
| `Cannot find module './vendor-chunks/@formatjs.js'` أو أجزاء `.next` مفقودة | تشغيل `pnpm build` (إنتاج) **أثناء** عمل خادم التطوير ⇒ يدهس `.next` ويترك أجزاء غير متّسقة | أوقف خادم الويب، ثم `rm -rf apps/web/.next apps/web/node_modules/.cache` وأعد `pnpm --filter @ibp/web dev` |
| `P1001 Can't reach database server at localhost:5434` | Docker Desktop متوقّف | `open -a Docker` ثم `docker start ibp-postgres ibp-redis` |
| nest watch يُظهر أخطاء أنواع قديمة (مثل `Commission` ناقص حقول) | عميل Prisma مولَّد قديم / كاش tsbuildinfo | `pnpm --filter @ibp/db generate` ثم احذف `apps/api/dist` وأعد التشغيل |
| اختبارات e2e تلوّث بيانات العرض | استخدام قاعدة `ibp_dev` للاختبار | الاختبارات تستخدم `ibp_test` عبر `.env.test` — شغّل `pnpm --filter @ibp/db test:setup` مرّة |

> **قاعدة:** لا تشغّل بناء الإنتاج (`pnpm build`) وخادم التطوير على نفس `.next` في آنٍ واحد.

## انظر أيضاً
- [14 — متغيّرات البيئة](./14-environment-variables.md) · [15 — قاعدة البيانات والترحيلات](./15-database-and-migrations.md)
- [16 — الاختبارات](./16-testing.md) · [02 — المعمار](./02-architecture.md)
