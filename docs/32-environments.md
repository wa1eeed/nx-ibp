# 32 — البيئات الثلاث وتدفّق الترقية (Dev · Staging · Production)

> الهدف: ترقيات وتحديثات وصيانة آمنة عبر فصل ثلاث بيئات. **الأساس جاهز** (تهيئة مدفوعة بالبيئة + أوضاع تكامل قابلة للتبديل + هجرات تقدّمية).
>
> **الحالة (2026-07-05):**
> - **dev** — جهاز المطوّر (محلي): Postgres 5434 · Redis 6381 · `NODE_ENV=development`.
> - **staging** — ✅ **منشورة حيًّا** على Coolify: الواجهة `https://ibp.nx.sa` · الـAPI `https://api.ibp.nx.sa` · بيانات ديمو (`seed:demo`) · تكاملات Sandbox. تُحاكي الإنتاج (نفس البناء والسلوك) وتُستخدم للاختبار/UAT.
> - **production** — ⏳ لاحقًا: تُنشأ من staging بعد اجتيازها، بمفاتيح حقيقية وبيانات حقيقية **داخل المملكة**.

## 1. البيئات والغرض
| البيئة | الغرض | البيانات | التكاملات |
|---|---|---|---|
| **dev** (محلي/مشترك) | تطوير يومي | وهمية (seed) | Sandbox/محاكاة |
| **staging** | مرآة الإنتاج للاختبار قبل الإطلاق + UAT | وهمية واقعية فقط | Sandbox (أو مفاتيح test) |
| **production** | البيئة الرسمية للعملاء | حقيقية — **داخل المملكة** (PDPL/هيئة التأمين) | حقيقية بعد النقل داخل المملكة |

## 2. تدفّق الترقية (Promotion)
`تطوير ← Staging ← Production` — لا يُرقَّى لأي بيئة إلا بعد اجتياز سابقتها.
1. تطوير وتجربة على **dev** (e2e خضراء محليًا).
2. دمج ⇒ نشر **staging** ⇒ اختبار دخان/UAT على مرآة الإنتاج.
3. بعد القبول ⇒ نشر **production** (بموافقة + بعد اجتياز الاختبارات).
> الفرع/الوسم ⇄ البيئة يُحسم عند ربط CI (موصى: `main`→staging تلقائيًا، وسم إصدار `vX.Y.Z`→production بموافقة). تُحدَّد آليًا عند إنشاء النسخ.

## 3. مصفوفة التهيئة لكل بيئة (env)
كل المتغيّرات الكاملة في [`.env.example`](../.env.example). القيم المختلفة جوهريًا بين البيئات:

| المتغيّر | dev | staging (الحالية) | production |
|---|---|---|---|
| `NODE_ENV` | development | production | production |
| `DATABASE_URL` / `REDIS_URL` | محلي (5434/6381) | Postgres/Redis داخل حزمة Coolify | **مستقلّة للإنتاج، داخل المملكة** |
| `JWT_SECRET` / `ZATCA_ENC_KEY` | تطوير فقط | سرّ مستقلّ (`openssl rand`) | سرّ مستقلّ (KMS لاحقًا) |
| `CORS_ORIGINS` | localhost:3000 | `https://ibp.nx.sa` | دومين الإنتاج |
| `NEXT_PUBLIC_API_URL` (build arg) | localhost:4000 | `https://api.ibp.nx.sa` | دومين API الإنتاج |
| `STORAGE_DRIVER` | local | local (volume) | s3/r2 (**دلو داخل المملكة**) |
| `ZATCA_DEFAULT_ENV` | SANDBOX | SANDBOX | Production (بعد الاعتماد داخل المملكة) |
| `NOTIFY_GATEWAY` / `BILLING_GATEWAY` | sandbox | sandbox | live (مفاتيح Taqnyat/Resend/Tap) |
| `SEED_MODE` | (فارغ = ديمو محلي) | `demo` | `production` (مرجعيات + سوبر أدمن فقط) |
| البيانات | seed وهمية | `seed:demo` (وهمية واقعية) | `seed:prod` ثم GIB حقيقي عبر `/signup` |

### تحصين مطابقة الإنتاج (Dev-only UI)
عناصر مساعِدة للتطوير **تُخفى تلقائيًا** عندما `NODE_ENV=production` (staging والإنتاج) وتظهر في dev فقط — عبر الثابت `DEV_PREFILL`/`DEV_ONLY = process.env.NODE_ENV !== "production"` (يُدمَج وقت البناء):
- **تعبئة بيانات الدخول** المسبقة في صفحات `login`/`admin/login`/`portal/login` + تلميح «حساب تجريبي».
- **شارة «Demo Session / وضع التجربة»** في القائمة الجانبية.

فالنسخة المنشورة تبدأ بخانات دخول فارغة وبلا أي إشارة ديمو — مطابقة للإنتاج.

**مبدأ:** لا أسرار في الكود؛ كل بيئة تحقن قيمها (في Coolify: مجموعة env لكل تطبيق). dev/staging لا تلمسان بيانات حقيقية إطلاقًا.

## 4. انضباط الهجرات (Migrations)
- جميع البيئات تستخدم **`prisma migrate deploy`** (تقدّمية، idempotent) — تُطبَّق تلقائيًا عند إقلاع الـ API عبر [`docker-entrypoint.sh`](../apps/api/docker-entrypoint.sh).
- **ممنوع** `migrate dev` / `migrate reset` على staging أو production.
- تُختبر الهجرة على staging قبل production. للنشر متعدّد النسخ: `SKIP_MIGRATIONS=true` + تشغيلها كخطوة إصدار واحدة.

## 5. التوطين (سيادة البيانات)
- **production**: القاعدة + النسخ الاحتياطية + السجلّات + المرفقات + دلو التخزين **داخل المملكة** (PDPL/هيئة التأمين). الاستضافة الحالية خارج المملكة **مؤقتة لما قبل الإطلاق فقط** — انظر [30 §4](./30-security-and-compliance.md).
- **dev/staging**: بيانات وهمية، فالاستضافة خارج المملكة مقبولة لهما.

## 6. الخريطة على Coolify (عند الإنشاء في النهاية)
نموذج Coolify = **تطبيق/مشروع مستقلّ لكل بيئة**. لكلٍّ: نسخة من [`docker-compose.coolify.yml`](../infra/docker/docker-compose.coolify.yml) + مجموعة env خاصّة (القسم 3) + دومين + قاعدة/Redis منفصلة. التفصيل في [`infra/docker/coolify.md`](../infra/docker/coolify.md).
- البديل k8s: overlays عبر kustomize (`overlays/staging`, `overlays/production`) فوق القاعدة في [`infra/k8s`](../infra/k8s/README.md) + namespace منفصل لكل بيئة. (Terraform يعرّف `environment` = dev|staging|production أصلاً.)

## 7. الحالة
- ✅ **الأساس جاهز**: تهيئة مدفوعة بالبيئة، أوضاع تكامل قابلة للتبديل (Sandbox↔حقيقي)، هجرات تقدّمية تلقائية، Terraform يعي البيئات.
- ✅ **staging منشورة حيًّا** (2026-07-05): `https://ibp.nx.sa` + `https://api.ibp.nx.sa` على Coolify، بيانات ديمو GIB، تكاملات Sandbox. تُحاكي الإنتاج وتُستخدم للاختبار.
- ⏳ **production**: تُنشأ من staging بعد اجتيازها — قاعدة/دومين/أسرار مستقلّة داخل المملكة + مفاتيح حقيقية + `seed:prod` + GIB حقيقي. + ربط CI للترقية الآلية (`main`→staging، وسم إصدار→production).

## انظر أيضاً
- [13 — الإعداد المحلي والتشغيل](./13-local-setup-and-operations.md) · [14 — متغيّرات البيئة](./14-environment-variables.md) · [`infra/docker/coolify.md`](../infra/docker/coolify.md) · [30 — الأمن والامتثال](./30-security-and-compliance.md)
