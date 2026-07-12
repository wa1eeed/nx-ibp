# 14 — متغيّرات البيئة (Environment Variables)

> كل تهيئة IBP عبر متغيّرات البيئة — **لا أسرار في الكود**. المرجع [`.env.example`](../.env.example)؛ انسخه إلى `.env` محلياً. الإنتاج يحقن القيم من البيئة (لا ملف). جدول كامل أدناه.

## جدول المتغيّرات

| المتغيّر | الغرض | مثال | يُستخدم في | المرحلة |
|---|---|---|---|---|
| `NODE_ENV` | بيئة التشغيل | `development` | عام | 0 |
| `POSTGRES_USER` | مستخدم القاعدة | `ibp` | compose | 0 |
| `POSTGRES_PASSWORD` | كلمة مرور القاعدة (محلية فقط) | `change_me_local_only` | compose | 0 |
| `POSTGRES_DB` | اسم القاعدة | `ibp_dev` | compose | 0 |
| `POSTGRES_PORT` | منفذ مضيف Postgres | `5432` (محلياً `5434`) | compose | 0 |
| `DATABASE_URL` | سلسلة اتصال Prisma | `postgresql://ibp:...@localhost:5434/ibp_dev?schema=public` | Prisma، الـ API | 0 |
| `REDIS_PORT` | منفذ مضيف Redis | `6379` (محلياً `6381`) | compose | 0 |
| `REDIS_URL` | سلسلة اتصال Redis | `redis://localhost:6381` | RedisService | 0 |
| `API_PORT` | منفذ الـ API | `4000` | `main.ts` | 0 |
| `CORS_ORIGINS` | أصول CORS المسموحة (مفصولة بفواصل) | `http://localhost:3000` | `main.ts` | 0 |
| `WEB_PORT` | منفذ الواجهة | `3000` | compose | 0 |
| `NEXT_PUBLIC_API_URL` | عنوان الـ API كما يراه المتصفّح | `http://localhost:4000` | `lib/api.ts` | 0 |
| `JWT_SECRET` | سرّ توقيع JWT (قيمة محلية فقط) | `replace_with_local_dev_secret_only` | AuthModule، الـ middleware | 1 |
| `JWT_EXPIRES_IN` | مدة صلاحية التوكن | `8h` | AuthModule | 1 |
| `STORAGE_DRIVER` | محرّك التخزين (حيادي المزوّد) | `local` \| `s3` \| `alibaba_oss` \| `google_cloud_storage` \| `minio` | وحدة المستندات | 5 |
| `STORAGE_LOCAL_DIR` | مجلد التخزين للسائق المحلي | `.storage` | StorageService | 5 |
| `STORAGE_ENDPOINT` | عنوان نقطة التخزين | `http://minio:9000` / `s3.me-central-1.amazonaws.com` | المستندات | 5 |
| `STORAGE_REGION` | منطقة التخزين | `me-central-1` | المستندات | 5 |
| `STORAGE_BUCKET` | اسم الحاوية | `ibp-dev` | المستندات | 5 |
| `STORAGE_ACCESS_KEY` | مفتاح الوصول | — | المستندات | 5 |
| `STORAGE_SECRET_KEY` | المفتاح السرّي | — | المستندات | 5 |
| `PRESIGNED_URL_EXPIRY_SECONDS` | صلاحية الرابط الموقّت (ثوانٍ) | `300` (5 دقائق) | المستندات | 5 |

## قواعد

- **لا تضع قيماً حقيقية** في `.env.example` ولا في الكود — فقط نائبات. الأسرار الحقيقية في بيئة الإنتاج.
- `.env` مُهمَل من git (انظر `.gitignore`).
- متغيّرات `NEXT_PUBLIC_*` فقط هي المكشوفة للمتصفّح؛ الباقي خادمي.
- الـ API يحمّل `.env` الجذر بالبحث صعوداً (`loadRootEnv` في [`main.ts`](../apps/api/src/main.ts))؛ سكربتات `db:*` تحمّله عبر `dotenv-cli`.

## انظر أيضاً
- [13 — التشغيل المحلي والعمليات](./13-local-setup-and-operations.md)
- [04 — الأمان وعزل المستأجرين](./04-security-and-multitenancy.md) — JWT و CORS
- [17 — الامتثال](./17-compliance-and-regulatory.md) — التخزين والتوطين
