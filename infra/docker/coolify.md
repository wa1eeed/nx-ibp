# نشر IBP على Coolify

دليل نشر حزمة IBP (API + Web + Postgres + Redis) على [Coolify](https://coolify.io) عبر Docker Compose. النشر **حياديّ سحابياً** ويعمل على أي VPS.

> ⚠️ **سيادة البيانات (PDPL/هيئة التأمين):** بيانات الإنتاج الحقيقية + النسخ الاحتياطية + السجلّات + المرفقات يجب أن تبقى **داخل المملكة**. الاستضافة الحالية خارج المملكة **مؤقتة ومقبولة لبيانات وهمية/ما قبل الإطلاق فقط**. لا تُفعّل أي ربط حكومي حقيقي قبل النقل داخل المملكة — انظر [docs/30 §4](../../docs/30-security-and-compliance.md).

## 0. نشر ديمو سريع (Sandbox — بلا مفاتيح)

بيئة ديمو ليجرّبها العميل: كل التكاملات Sandbox (بلا SMS/دفع/فوترة فعلية)، بيانات GIB شبه واقعية. المتغيّرات الدنيا فقط:

```bash
POSTGRES_PASSWORD=$(openssl rand -base64 24)
JWT_SECRET=$(openssl rand -base64 48)
ZATCA_ENC_KEY=$(openssl rand -base64 32)
CORS_ORIGINS=https://app.demo.example.sa      # دومين الواجهة
NEXT_PUBLIC_API_URL=https://api.demo.example.sa  # دومين الـ API (build arg)
SEED_MODE=demo                                # يسمح ببذرة الديمو على NODE_ENV=production
```

بعد أوّل نشر ناجح، شغّل البذرة لمرة واحدة من طرفية خدمة `api`:
`cd /app && pnpm --filter @ibp/db run seed:demo` — ثم ادخل بـ `AAlanazi@gib-sa.com` / `Passw0rd!`.

> **مُتحقَّق محليًّا:** الصورتان تُبنيان، الـ API يُقلع ويطبّق الهجرات تلقائيًا (`/health` = DB+Redis)، وبذرة الديمو + تسجيل الدخول يعملان داخل الحاوية. تفاصيل الإنتاج الحقيقي في القسمين 3 و6.

## 1. المتطلّبات
- خادم Coolify عامل (VPS بـ Docker).
- دومينان (أو دومين + نطاق فرعي): مثل `app.example.com` للواجهة و`api.example.com` للـ API.
- مفاتيح TLS تُدار آليًا من Coolify (Let's Encrypt) عند ربط الدومين.

## 2. الخطوات
1. **مشروع جديد** في Coolify ⇒ Resource ⇒ **Docker Compose**.
2. اربط مستودع Git (هذا الريبو) واختر ملف الـ Compose: `infra/docker/docker-compose.coolify.yml`.
3. **اضبط متغيّرات البيئة** (القسم 3). الأسرار بصيغة `${VAR:?...}` ستُفشل النشر إن لم تُضبط — وهذا مقصود.
4. **اربط الدومينات**: وجِّه الدومين الرئيسي لخدمة `web` (المنفذ 3000)، والنطاق الفرعي لخدمة `api` (المنفذ 4000). Coolify يصدر شهادات TLS تلقائيًا.
5. **انشر (Deploy)**. عند إقلاع الـ API تُطبَّق هجرات Prisma تلقائيًا (`migrate deploy` عبر `docker-entrypoint.sh`).
6. **بذرة الإقلاع** (لمرة واحدة، من طرفية الخدمة `api`):
   - **إنتاج حقيقي:** `cd /app && pnpm --filter @ibp/db run seed:prod` — يبذر المرجعيات فقط (باقات/كتالوج/مزوّدون) + **سوبر أدمن من `PLATFORM_ADMIN_EMAIL`/`PLATFORM_ADMIN_PASSWORD`**. **لا مستأجرين وهميين.** حساب العميل (مثل GIB) يُنشأ بعدها عبر `/signup` أو التزويد.
   - **بيئة ديمو/تجريبية:** `cd /app && pnpm --filter @ibp/db run seed:demo` — يبذر بيانات ديمو شبه واقعية.
   - ⚠️ بذرة الديمو مرفوضة تلقائيًا على `NODE_ENV=production` ما لم يُضبط `SEED_MODE=demo` صراحةً.

## 3. متغيّرات البيئة
| المتغيّر | إلزامي | ملاحظة |
|---|---|---|
| `POSTGRES_PASSWORD` | ✅ | كلمة مرور قاعدة قويّة |
| `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` | ✅ (لـ `seed:prod`) | سوبر أدمن الإقلاع — كلمة مرور ≥ 12 حرفًا؛ لا تُعاد كتابتها إن وُجد الحساب |
| `POSTGRES_USER` / `POSTGRES_DB` | — | افتراضي `ibp` / `ibp` |
| `JWT_SECRET` | ✅ | `openssl rand -base64 48` |
| `ZATCA_ENC_KEY` | ✅ | تشفير الاعتماد at-rest: `openssl rand -base64 32` |
| `CORS_ORIGINS` | ✅ | دومين الواجهة، مثل `https://app.example.com` |
| `NEXT_PUBLIC_API_URL` | ✅ | دومين الـ API العام، مثل `https://api.example.com`. **يُدمَج وقت البناء** (build arg) في حزمة العميل — عند تغييره **أعد البناء** (لا يكفي إعادة التشغيل). |
| `JWT_EXPIRES_IN` | — | افتراضي `15m` |
| `ZATCA_DEFAULT_ENV` | — | `SANDBOX` (الإنتاج الحقيقي بعد النقل داخل المملكة) |
| `LOGIN_MAX_FAILURES` / `LOGIN_LOCK_WINDOW_SEC` | — | قفل القوّة الغاشمة (8 / 900) |
| `STORAGE_DRIVER` | — | `local` (افتراضي) أو `s3`/`r2`/`minio`/`alibaba_oss` |
| `STORAGE_ENDPOINT`/`STORAGE_BUCKET`/`STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY`/`STORAGE_REGION`/`STORAGE_FORCE_PATH_STYLE` | عند السحابي | انظر [docs/21](../../docs/21-document-service.md) و[.env.example](../../.env.example) |

## 4. الهجرات والنسخ المتعدّدة
- الافتراضي: الـ API يطبّق الهجرات عند الإقلاع (آمن لنسخة واحدة).
- عند تشغيل **عدة نسخ** من الـ API: اضبط `SKIP_MIGRATIONS=true` وشغّل الهجرات كخطوة منفصلة قبل النشر (لتفادي تسابق الهجرات):
  `cd /app && pnpm --filter @ibp/db run migrate:deploy:prod`

## 5. الفحص الصحّي والمراقبة
- `GET /health/live` — فحص حيّ بسيط (تستخدمه healthcheck في الـ Compose).
- `GET /health` — فحص شامل (DB + Redis)، يرجع `503` لو إحداها معطّلة.
- سجلّات كل خدمة عبر لوحة Coolify.

## 6. التخزين الدائم
- `local`: مرفقات على volume `ibp_storage` (مناسب لـ VPS واحد؛ خذ نسخًا احتياطية).
- سحابي (`s3`/`r2`): المرفقات في الدلو مباشرةً — لا حاجة لـ volume. **راعِ سيادة البيانات** للإنتاج الحقيقي.

## 7. استكشاف الأخطاء (من نشر staging الفعلي — `ibp.nx.sa`)
| العَرَض | السبب | الحل |
|---|---|---|
| `Docker Compose file not found ... .ym` | خطأ إملائي في الامتداد | المسار الصحيح **حرفيًا**: `infra/docker/docker-compose.coolify.yml` (`.yml`) |
| `Error: lstat /apps: no such file or directory` | سياق البناء كان `../..` وCoolify يشغّل من جذر المستودع فيقفز فوقه | مُصلَح في المستودع: `build.context: .` (جذر المستودع) |
| بناء الواجهة يطلب دومين API أو يظهر `localhost` بالمتصفح | `NEXT_PUBLIC_API_URL` يُدمَج **وقت البناء** | يُمرَّر `build arg` (مضبوط في الـcompose)؛ عند تغيير الدومين **أعد البناء** لا التشغيل |
| فشل البناء `exit 255` في منتصفه دون رسالة خطأ | تذبذب في مُغلّف بناء Coolify (بناء متوازٍ للخدمتين) | **أعد المحاولة** — أول بناء يُسخّن الـcache فيُسرّع اللاحق ويتجاوز العثرة. للتشخيص: ابنِ الصور يدويًا على السيرفر (أدناه) |
| `Invalid credentials` بعد نشر ناجح | الهجرات تُطبَّق تلقائيًا لكن **البذرة لا** — القاعدة بلا مستخدمين | شغّل البذرة مرّة واحدة (أدناه) |

**بناء الصور يدويًا على السيرفر (تشخيص/بديل):**
```bash
cd /tmp && rm -rf ibp-build && git clone --depth 1 https://github.com/wa1eeed/nx-ibp.git ibp-build && cd ibp-build && docker compose --project-directory . -f infra/docker/docker-compose.coolify.yml build
```
لو نجح ⇒ صورك سليمة والمشكلة في تنسيق Coolify فقط.

**تشغيل البذرة بعد النشر (مرّة واحدة):** من طرفية خدمة `api` في Coolify، أو عبر SSH للمضيف:
```bash
docker exec $(docker ps --format '{{.Names}}' | grep -m1 -i api) sh -c "cd /app && pnpm --filter @ibp/db run seed:demo"
```
انتظر `✅ تمّ الزرع`. القاعدة على volume دائم ⇒ لا تتكرّر مع كل نشر.

## انظر أيضاً
- [13 — الإعداد المحلي والتشغيل](../../docs/13-local-setup-and-operations.md) · [14 — متغيّرات البيئة](../../docs/14-environment-variables.md)
- [30 — الأمن والامتثال](../../docs/30-security-and-compliance.md) · [infra/k8s](../k8s/README.md) (نشر Kubernetes البديل)
