# 37 — دليل النقل والتركيب السريع على السحابة (GCP · AWS · Alibaba)

> قائمة إرشادية **مُفصَّلة وشاملة** لنقل/تركيب المنصّة على أي سحابة، بلا نسيان أيّ إعداد. تُقرأ مع [14 — متغيّرات البيئة](./14-environment-variables.md) · [32 — البيئات](./32-environments.md) · [33 — دليل الإطلاق](./33-launch-runbook.md) · [`infra/docker/coolify.md`](../infra/docker/coolify.md).
>
> **المبدأ:** كل تكامل يعمل بـ Sandbox ويتحوّل للإنتاج بـ **تغيير متغيّر بيئة + مفتاح، دون تغيير كود**. فالنقل = تجهيز بنية + حقن متغيّرات + هجرة بيانات + تحقّق.

## جدول المحتويات
- [0. المكوّنات ومتطلّبات ما قبل البدء](#0-المكوّنات-ومتطلّبات-ما-قبل-البدء)
- [1. تجهيز البنية لكل سحابة](#1-تجهيز-البنية-لكل-سحابة)
- [2. متغيّرات البيئة الكاملة (لا تنسَ شيئًا)](#2-متغيرات-البيئة-الكاملة-لا-تنس-شيئًا)
- [3. توليد الأسرار](#3-توليد-الأسرار)
- [4. تسلسل النشر](#4-تسلسل-النشر)
- [5. المهام المجدولة (Cron)](#5-المهام-المجدولة-cron)
- [6. توصيل التكاملات (Sandbox ⇒ Production)](#6-توصيل-التكاملات-sandbox--production)
- [7. هجرة البيانات بين المضيفين](#7-هجرة-البيانات-بين-المضيفين)
- [8. قائمة التحقّق بعد النشر](#8-قائمة-التحقق-بعد-النشر)
- [9. النسخ الاحتياطي والتعافي + التراجع](#9-النسخ-الاحتياطي-والتعافي--التراجع)

---

## 0. المكوّنات ومتطلّبات ما قبل البدء

المنصّة = **4 خدمات** (حاويات Docker):

| الخدمة | الصورة/المصدر | المنفذ | الاعتماد |
|---|---|---|---|
| **web** (Next.js) | `apps/web/Dockerfile` | 3000 | api |
| **api** (NestJS) | `apps/api/Dockerfile` | 4000 | postgres · redis |
| **postgres** 16 | مُدارة (مُوصى) أو حاوية | 5432 | — |
| **redis** 7 | مُدارة أو حاوية | 6379 | — |
| **تخزين كائني** | GCS/S3/OSS (متوافق S3) | — | — |

**قبل البدء جهّز:**
- [ ] حساب سحابة + مشروع/اشتراك.
- [ ] **نطاقان**: للواجهة (مثل `ibp.payone.one`) وللـAPI (مثل `api.ibp.payone.one`) + صلاحية DNS.
- [ ] **قاعدة PostgreSQL 16** مُدارة (مُوصى للإنتاج، مع نسخ احتياطي/PITR) — أو حاوية للـstaging.
- [ ] **Redis 7** مُدار أو حاوية.
- [ ] **دلو تخزين كائني** متوافق S3 + مفتاحا وصول (Access/Secret).
- [ ] **الامتثال (هيئة التأمين/NCA):** بيانات الإنتاج **داخل المملكة** — فضّل أقاليم داخل السعودية (GCP الدمّام · Alibaba الرياض). AWS بلا إقليم داخل المملكة حاليًا (الأقرب البحرين/الإمارات) — قرار امتثالي. staging (بيانات ديمو) أقلّ حساسية.

---

## 1. تجهيز البنية لكل سحابة

الخطوات متطابقة منطقيًا؛ تختلف الأسماء. المطلوب من كلٍّ: **حوسبة + Postgres + Redis + تخزين + نطاقات/TLS**.

### أ) Google Cloud (مُوصى: إقليم **الدمّام me-central2** — داخل المملكة)
- **الحوسبة:** Compute Engine VM (Ubuntu 22.04، ‏2vCPU/4GB فأكثر) + Docker/Coolify، **أو** Cloud Run (حاوية لكل خدمة).
- **قاعدة البيانات:** **Cloud SQL for PostgreSQL 16** — فعّل النسخ الاحتياطي التلقائي + PITR. خذ `DATABASE_URL` (مع `?schema=public`).
- **Redis:** **Memorystore for Redis 7** — خذ `REDIS_URL`.
- **التخزين:** **Cloud Storage** بوضع التوافق مع S3 — أنشئ دلوًا + **مفاتيح HMAC** (Settings → Interoperability). القيم: `STORAGE_DRIVER=s3` · `STORAGE_ENDPOINT=https://storage.googleapis.com` · `STORAGE_REGION=auto` · `STORAGE_FORCE_PATH_STYLE=true`.
- **النطاقات/TLS:** اربط النطاقين (Load Balancer + Managed Certificates، أو Coolify التلقائي).

### ب) AWS (الأقرب: **البحرين me-south-1** أو **الإمارات me-central-1**)
- **الحوسبة:** EC2 (Ubuntu) + Docker/Coolify، **أو** ECS/Fargate.
- **قاعدة البيانات:** **RDS for PostgreSQL 16** — Multi-AZ + النسخ الاحتياطي.
- **Redis:** **ElastiCache for Redis 7**.
- **التخزين:** **S3** — أنشئ دلوًا + مفتاح IAM (S3 read/write). القيم: `STORAGE_DRIVER=s3` · `STORAGE_ENDPOINT=https://s3.me-central-1.amazonaws.com` · `STORAGE_REGION=me-central-1` · `STORAGE_FORCE_PATH_STYLE=false`.
- **النطاقات/TLS:** Route53 + ACM (شهادات) + ALB.

### ج) Alibaba Cloud (مُوصى: إقليم **الرياض me-central-1** — داخل المملكة)
- **الحوسبة:** ECS (Ubuntu) + Docker/Coolify.
- **قاعدة البيانات:** **ApsaraDB RDS for PostgreSQL 16** — النسخ الاحتياطي التلقائي.
- **Redis:** **ApsaraDB for Redis 7**.
- **التخزين:** **OSS** (متوافق S3) — أنشئ Bucket + AccessKey. القيم: `STORAGE_DRIVER=alibaba_oss` (أو `s3`) · `STORAGE_ENDPOINT=https://oss-me-central-1.aliyuncs.com` · `STORAGE_REGION=me-central-1` · `STORAGE_FORCE_PATH_STYLE=true`.
- **النطاقات/TLS:** Alibaba DNS + شهادة SSL.

> **بديل مبسّط (الحالي على staging):** حزمة `docker-compose.coolify.yml` تشغّل الأربعة معًا على خادم واحد (Postgres/Redis كحاويتين مع volumes دائمة) — مناسب للـstaging/الديمو بلا قواعد مُدارة. للإنتاج فضّل القواعد المُدارة.

---

## 2. متغيّرات البيئة الكاملة (لا تنسَ شيئًا)

> المصدر الكامل: [`.env.example`](../.env.example). في Coolify: مجموعة متغيّرات لكل تطبيق (web/api). **الأسرار لا تُكتب في الكود إطلاقًا.**

### أ) عام والبذرة
| المتغيّر | مثال/قيمة الإنتاج | ملاحظة |
|---|---|---|
| `NODE_ENV` | `production` | staging والإنتاج |
| `SEED_MODE` | `demo` (staging) · `production` (إنتاج) | يحدّد محتوى البذرة |
| `SEED_ON_START` | `demo` مرّة ثم احذفه | يبذر عند الإقلاع (وإلّا لا بذر تلقائي) |
| `CR_REGISTRY_DIR` | مسار مجلد مُثبَّت (volume) | لقطة السجل التجاري (البيانات المفتوحة): يُزامنها الـentrypoint عند الإقلاع من هذا المجلد (يستورد الجديد فقط). ارفع ملفّات `.xlsx` هناك. غير مضبوط ⇒ يُتخطّى |
| `CR_REGISTRY_FRESH` | `true` مرّة عند لقطة فصلية جديدة | يمسح ثم يعيد الاستيراد الكامل؛ ثم احذفه |
| `PLATFORM_ADMIN_EMAIL` | `admin@…` | 🔒 سوبر أدمن المنصّة |
| `PLATFORM_ADMIN_PASSWORD` | ≥ 12 حرفًا | 🔒 يُغيَّر لاحقًا بـ`admin:set` |
| `PLATFORM_ADMIN_NAME` | `مالك المنصة` | |

### ب) قاعدة البيانات وRedis
| المتغيّر | مثال | ملاحظة |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/ibp?schema=public` | 🔒 من القاعدة المُدارة |
| `POSTGRES_USER/PASSWORD/DB/PORT` | — | للحاوية المدمجة فقط (compose) |
| `REDIS_URL` | `redis://host:6379` | الكاش + قفل الدخول + تحديد المعدّل |

### ج) الـAPI والواجهة والنطاقات
| المتغيّر | قيمة الإنتاج | ⚠️ |
|---|---|---|
| `API_PORT` / `WEB_PORT` | 4000 / 3000 | |
| `CORS_ORIGINS` | `https://ibp.payone.one` | **يجب أن يطابق نطاق الواجهة** وإلا CORS يفشل |
| `NEXT_PUBLIC_API_URL` | `https://api.ibp.payone.one` | **يُخبَز وقت البناء** — تغييره يستلزم **إعادة بناء الويب** |
| `APP_PUBLIC_URL` | `https://ibp.payone.one` | روابط العودة بعد الدفع |
| `API_PUBLIC_URL` | `https://api.ibp.payone.one` | روابط الـwebhook + شعار البريد |
| `NEXT_PUBLIC_SITE_URL` | `https://ibp.payone.one` | sitemap/robots/الوسوم — يُخبَز وقت البناء |

### د) الأمان
| المتغيّر | كيف | ملاحظة |
|---|---|---|
| `JWT_SECRET` | `openssl rand -base64 48` | 🔒 سرّ توقيع الجلسات |
| `JWT_EXPIRES_IN` | `8h` | |
| `ZATCA_ENC_KEY` | `openssl rand -base64 32` | 🔒 تشفير الأسرار at-rest (Tap/Resend/…) — **لا تغيّره بعد التخزين وإلّا تعذّر فكّها** |
| `LOGIN_MAX_FAILURES` / `LOGIN_LOCK_WINDOW_SEC` | 8 / 900 | قفل القوّة الغاشمة |
| `THROTTLE_MAX` / `THROTTLE_WINDOW_SEC` | 600 / 60 | تحديد المعدّل لكل IP |
| `API_BODY_LIMIT` | `2mb` | (رفع المستندات مساره الخاص 50mb) |
| `CARRIER_WEBHOOK_SECRET` | 🔒 | توقيع webhooks المؤمِّنين (أو `CARRIER_WEBHOOK_SECRET_<CARRIER>`) |

### هـ) التخزين الكائني
`STORAGE_DRIVER` · `STORAGE_ENDPOINT` · `STORAGE_REGION` · `STORAGE_BUCKET` · `STORAGE_ACCESS_KEY`🔒 · `STORAGE_SECRET_KEY`🔒 · `STORAGE_FORCE_PATH_STYLE` · `PRESIGNED_URL_EXPIRY_SECONDS=300`. (القيم لكل سحابة في §1.)

### و) التكاملات (تُملأ عند التفعيل — §6)
- **الدفع:** `BILLING_GATEWAY` (`sandbox`\|`tap`) · `BILLING_CURRENCY=SAR` · `BILLING_WEBHOOK_SECRET` · `TAP_SECRET_KEY`🔒 · `TAP_API_URL`. *(بوّابة المنصّة يمكن ضبطها أيضًا من لوحة السوبر أدمن `/admin/payment`.)*
- **ZATCA:** `ZATCA_DEFAULT_ENV` (`SANDBOX`\|`Production`).
- **الإشعارات:** `NOTIFY_GATEWAY` (`sandbox`\|`live`) · **SMS**: `TAQNYAT_API_KEY`🔒 `TAQNYAT_SENDER` `TAQNYAT_API_URL` · **Email**: `RESEND_API_KEY`🔒 `NOTIFY_EMAIL_FROM` `RESEND_API_URL` · `EMAIL_FALLBACK_FROM` (المُرسِل المركزي الاحتياطي).

---

## 3. توليد الأسرار
```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 32   # ZATCA_ENC_KEY (32 بايت بالضبط)
openssl rand -hex 32      # CARRIER_WEBHOOK_SECRET / BILLING_WEBHOOK_SECRET
```
> **حرِج:** احتفظ بـ`ZATCA_ENC_KEY` ثابتًا بعد أول تخزين لأسرار (Tap/Resend/بوّابات المستأجرين) — تغييره يجعلها غير قابلة للفكّ. خزّنه في مدير أسرار (KMS/Vault) عند النضج.

---

## 4. تسلسل النشر
1. **جهّز البنية** (§1) واحصل على `DATABASE_URL` · `REDIS_URL` · مفاتيح التخزين.
2. **احقن المتغيّرات** (§2) في تطبيقَي web وapi (Coolify env groups، أو `.env` للـcompose).
3. **انشر** الحاويات (Coolify Deploy، أو `docker compose -f infra/docker/docker-compose.coolify.yml up -d --build`).
4. **الهجرات تلقائية عند إقلاع الـAPI** (`docker-entrypoint.sh` ⇒ `prisma migrate deploy`) — عطّلها بـ`SKIP_MIGRATIONS=true` للنشر متعدّد النسخ (شغّلها كـJob منفصل).
5. **البذر (مرّة):**
   - **إنتاج حقيقي:** `SEED_MODE=production` + `SEED_ON_START=production` (أو يدويًا `docker exec <api> sh -c "cd /app && pnpm --filter @ibp/db run seed:prod"`) — مرجعيات + سوبر أدمن فقط، بلا بيانات وهمية.
   - **staging/ديمو:** `SEED_ON_START=demo` (أو `seed:demo` يدويًا) — بيانات ديمو شبه واقعية + سجلّ رحلة مُعبّأ. **ثم احذف `SEED_ON_START`** كي لا يُعاد البذر كل إقلاع.
6. **تحقّق** (§8).

---

## 5. المهام المجدولة (Cron)
الجدولة **داخلية** عبر `@nestjs/schedule` (`ScheduleModule.forRoot()` في [`app.module.ts`](../apps/api/src/app.module.ts)) — تعمل **داخل عملية الـAPI**، بلا كرون نظام خارجي:

| المهمّة | الجدول | الوظيفة | المصدر |
|---|---|---|---|
| `reminders-daily` | يوميًا 8ص | تذكير مهام CRM المستحقّة · الوثائق المقتربة من التجديد · الأقساط المستحقّة (قبل/عند) · إرسال التقارير المجدولة | [`reminders.service.ts`](../apps/api/src/modules/reminders/reminders.service.ts) |
| `email-domain-verify` | كل 30 دقيقة | التحقّق الدوري من نطاقات البريد (DNS) للمستأجرين | [`tenant-email.service.ts`](../apps/api/src/modules/email/tenant-email.service.ts) |

**متطلّبات التشغيل:**
- [ ] الحاوية تعمل بلا توقّف (`restart: unless-stopped`) — الكرون داخل العملية.
- [ ] **المنطقة الزمنية**: اضبط `TZ=Asia/Riyadh` على حاوية الـAPI ليطابق «8ص» التوقيت المحلي.
- [ ] ⚠️ **النشر متعدّد النسخ**: الكرون سيعمل **على كل نسخة** (لا قفل موزّع بعد). عند التوسّع لأكثر من نسخة، شغّل نسخة واحدة مخصّصة للكرون (أو أضِف قفل Redis) — حاليًا نسخة واحدة (staging) فالوضع سليم.
- [ ] لا يلزم إعداد خارجي؛ الحتمية داخلية (كل تذكير يُوسَم فلا يتكرّر).
- [ ] تشغيل يدوي للاختبار: نقطة إدارية `POST /reminders/run` (إن وُجدت) أو استدعاء `sweep(now)`.

---

## 6. توصيل التكاملات (Sandbox ⇒ Production)
| التكامل | متغيّرات الإنتاج | المطلوب منك |
|---|---|---|
| **التخزين** | `STORAGE_DRIVER=s3\|alibaba_oss` + endpoint/bucket/keys (§1) | دلو داخل المملكة |
| **الدفع (Tap)** | `BILLING_GATEWAY=tap` + `TAP_SECRET_KEY=sk_live_…` (أو من `/admin/payment`) | حساب Tap إنتاجي |
| **ZATCA Fatoora** | `ZATCA_DEFAULT_ENV=Production` + إتمام CSR/CSID | اعتماد الهيئة داخل المملكة |
| **SMS (Taqnyat)** | `NOTIFY_GATEWAY=live` + `TAQNYAT_API_KEY` + `TAQNYAT_SENDER` | اسم مُرسِل معتمد |
| **Email (Resend)** | `NOTIFY_GATEWAY=live` + `RESEND_API_KEY` + `NOTIFY_EMAIL_FROM` | نطاق مُوثَّق (SPF/DKIM/DMARC) |
| **التحقّق (يقين/نفاذ)** | مفاتيح المزوّد | حسابات الربط الحكومي |

---

## 7. هجرة البيانات بين المضيفين
عند **نقل قاعدة قائمة** (لا تركيب جديد):
```bash
# 1) نسخة من المصدر
pg_dump --no-owner --no-privileges -Fc "$OLD_DATABASE_URL" -f ibp.dump
# 2) استعادة على الوجهة (بعد إنشاء قاعدة فارغة)
pg_restore --no-owner --no-privileges -d "$NEW_DATABASE_URL" ibp.dump
# 3) طبّق الهجرات الأحدث (idempotent)
DATABASE_URL="$NEW_DATABASE_URL" pnpm --filter @ibp/db run migrate:deploy:prod
```
- [ ] **المرفقات (التخزين الكائني):** انسخ محتوى الدلو القديم للجديد (`rclone`/`aws s3 sync`) واضبط متغيّرات التخزين الجديدة.
- [ ] بدّل `DATABASE_URL`/`REDIS_URL`/التخزين في متغيّرات الوجهة ثم أعِد النشر.
- [ ] **لا تُعِد البذر** على قاعدة تحوي بيانات حقيقية (البذر للتركيب الأوّل فقط).

---

## 8. قائمة التحقّق بعد النشر
- [ ] `GET https://api.ibp.payone.one/health` ⇒ 200 (DB+Redis) · `/health/live` ⇒ 200.
- [ ] فتح الواجهة `https://ibp.payone.one` + تسجيل دخول (سوبر أدمن + مستأجر).
- [ ] لا أخطاء CORS في المتصفّح (يعني `CORS_ORIGINS`/`NEXT_PUBLIC_API_URL` صحيحة).
- [ ] رفع مستند ⇒ يُخزَّن في الدلو (رابط موقّت يعمل).
- [ ] دورة صفقة تجريبية كاملة (عميل ⇒ طلب ⇒ تسعير ⇒ إصدار) + ظهورها في **الخط الزمني**.
- [ ] TLS 1.3 فعّال على النطاقين.
- [ ] **فعّل MFA** لكل حسابات سوبر أدمن قبل فتح الوصول.
- [ ] الكرون: تأكّد من `TZ=Asia/Riyadh` + أن الحاوية دائمة التشغيل.
- [ ] النسخ الاحتياطي الآلي مُفعّل على القاعدة المُدارة.

---

## 9. النسخ الاحتياطي والتعافي + التراجع
- **النسخ الاحتياطي:** فعّل PITR/الآلي على القاعدة المُدارة + نسخ دوري للدلو. اختبر الاستعادة دوريًا (RPO/RTO).
- **التراجع (Rollback):** Coolify يحتفظ بالنشرات السابقة — الرجوع نشرة واحدة. **الهجرات تقدّمية** (لا تراجع تلقائي للبيانات) — **خذ نسخة قبل أي إطلاق كبير**.
- **الأسرار:** دوّرها عبر KMS/Vault عند النضج؛ راجع سجلّ التدقيق دوريًا (`GET /platform/audit`).

## انظر أيضاً
[14 — متغيّرات البيئة](./14-environment-variables.md) · [32 — البيئات](./32-environments.md) · [33 — دليل الإطلاق](./33-launch-runbook.md) · [30 — الأمن والامتثال](./30-security-and-compliance.md) · [`infra/docker/coolify.md`](../infra/docker/coolify.md) · [`.env.example`](../.env.example)
