# IBP — منصة وساطة التأمين (Insurance Broker Platform)

منصة SaaS متعددة المستأجرين لشركات وساطة التأمين في السعودية. هذا الـ monorepo يضمّ الواجهة والخدمات وقاعدة البيانات والبنية التحتية.

> 📚 **التوثيق الشامل في [`docs/`](./docs/README.md)** — ابدأ منه. المراجع الجذرية: `CLAUDE.md` (دستور المشروع) · `BLUEPRINT.md` (المرجع الوظيفي) · `ROADMAP.md` (الخطة) · `DESIGN.md` (رموز التصميم) · `CHANGELOG.md` (سجل التغييرات) · `design-references/` (التصميم البصري المعتمد).

## البنية
```
apps/web        واجهة Next.js (App Router, TS, Tailwind, RTL, i18n ar/en)
apps/api        خدمة NestJS (معماري وحدات؛ المرحلة 0: health + prisma + redis)
packages/db     مخطط Prisma + migrations + seed (مصدر البنية: prisma/schema.prisma)
packages/shared أنواع وثوابت مشتركة (كتالوج المنتجات، الموديولز، مصفوفة RBAC)
infra           docker / k8s / terraform
```

## المتطلّبات
Node ≥ 20 · pnpm ≥ 9 · Docker + Docker Compose. (متوفّرة جميعها لديك.)

## التشغيل المحلي خطوة بخطوة

```bash
# 1) المتغيّرات (لا أسرار في الكود)
cp .env.example .env

# 2) التبعيات
pnpm install

# 3) شغّل قاعدة البيانات و Redis فقط
pnpm infra:up           # = docker compose up -d postgres redis

# 4) ولّد عميل Prisma + أنشئ أول migration + ازرع بيانات وهمية
pnpm db:generate
pnpm db:migrate         # سمِّها init عند الطلب
pnpm db:seed

# 5) شغّل الواجهة والـ API معاً
pnpm dev                # web → http://localhost:3000 ، api → http://localhost:4000
```

بديل: تشغيل الحزمة كاملةً بالحاويات: `cp .env.example .env && docker compose up -d --build`.

## التحقق من نجاح المرحلة 0
```bash
curl -s http://localhost:4000/health        # ⇒ {"status":"ok","checks":{"database":"up","redis":"up"}}
open http://localhost:3000                   # ⇒ يحوّل إلى /ar/tenant/dashboard
```
- الواجهة تفتح، وتدعم العربية (RTL) والإنجليزية عبر مبدّل اللغة في الشريط العلوي.
- الـ API يردّ على `/health` بحالة التبعيات.
- الترحيل (migration) ينجح، والـ seed يدخل بيانات وهمية فقط.

## أوامر مفيدة
| الأمر | الوظيفة |
|---|---|
| `pnpm dev` | تشغيل web + api معاً |
| `pnpm dev:web` / `pnpm dev:api` | تشغيل واحدة |
| `pnpm db:studio` | فتح Prisma Studio |
| `pnpm db:reset` | إعادة ضبط القاعدة + إعادة الزرع |
| `pnpm typecheck` | فحص الأنواع لكل الحزم |
| `pnpm build` | توليد عميل Prisma + بناء الكل |

## المصادقة وعزل المستأجرين (المرحلة 1)
مصادقة JWT + سياق المستأجر (AsyncLocalStorage) في كل طلب + **Prisma middleware يفرض `tenantId` تلقائياً** على كل استعلام. الـ seed يُنشئ مستأجرَين لاختبار العزل.

| النقطة | الوصف |
|---|---|
| `POST /auth/login` | `{ email, password }` ⇒ `{ accessToken, user }` (عام) |
| `GET /auth/me` | المستخدم الحالي (محمي) |
| `GET /clients` | عملاء المستأجر الحالي فقط (محمي) — يُوسَّع في المرحلة 3 |
| `GET /clients/:id` | معرّف مستأجر آخر ⇒ 404 |
| `GET /health` | فحص صحّي (عام) |

**حسابات تطوير (وهمية، كلمة المرور `Passw0rd!`):**
`waleed@gulf-demo.sa` (وكالة الخليج) · `omar@aman-demo.sa` (شركة الأمان).

**اختبار العزل الصريح:**
```bash
pnpm db:seed                       # مستأجران ببياناتهما
pnpm --filter @ibp/api test:e2e    # 8 اختبارات: لا تسرّب بيانات بين المستأجرين
```

## الصلاحيات: RBAC + Entitlements (المرحلة 2)
حارس موحّد على كل endpoint معلَّم بـ `@Authorize` يفحص **فحصين** (CLAUDE.md §3): هل الموديول مفعّل في باقة المستأجر؟ + هل لدور المستخدم صلاحية الفعل؟

| النقطة | الحراسة |
|---|---|
| `GET /clients` | entitlement `module.clients` + RBAC `clients:read` |
| `GET /claims` | entitlement `module.claims` + RBAC `claims:read` |
| `GET /staff` · `GET /staff/roles` | RBAC `settings:read` |
| `POST /staff` | RBAC `settings:create` — ينشئ موظفاً بدور مخصّص من المصفوفة |

**الواجهة:** صفحة دخول `/[locale]/login` + شاشة **إدارة الموظفين** `/[locale]/tenant/settings/staff` (قائمة + نموذج «موظف جديد» بمصفوفة 12 موديول × 4 صلاحيات، موصولة بالـ API).

**أمثلة الباقات (seed):** الخليج = premium + إضافة مطالبات · الأمان = basic (المطالبات/التقارير/الالتزام مقفلة).

**اختبار الصلاحيات الصريح:**
```bash
pnpm --filter @ibp/api test:e2e   # 18 اختباراً (عزل + RBAC/entitlements)
```

## العملاء + النموذج الديناميكي (المرحلة 3)
محرّك نموذج **مدفوع بمخطط** يتكيّف مع تنوّع منتجات التأمين (طبي/مركبات/ممتلكات/هندسي/بحري/عام/حياة). الكتل المتكررة تُخزَّن في `RequestBlockRow` العام (تابعون/مركبات/مواقع/شحنات/أرواح/مسافرون).

| النقطة | الوصف |
|---|---|
| `GET /catalog` · `GET /catalog/lines/:code` | شجرة الفئات/الفروع + مخطط نموذج الفرع |
| `POST /clients` | إنشاء عميل (كود تجاري CLI-… + تفرّد CR/الهوية + يبدأ بحالة التزام PENDING) |
| `POST /clients/:id/compliance` | بوّابة الالتزام: اعتماد/رفض قبل السماح بالطلبات (صلاحية compliance) |
| `POST /requests` | محرّك تحقّق عام ضد مخطط الفرع + **بوّابة الالتزام** + تخزين الكتل + رقم تسلسل |

**الواجهة:** `clients` (قائمة + إنشاء + اعتماد) · `requests` + `requests/new` (عارض `DynamicForm` يولّد النموذج المناسب لكل منتج).

```bash
pnpm --filter @ibp/api test:e2e   # 31 اختباراً (عزل + RBAC + نموذج ديناميكي + بوّابة التزام)
```

## قواعد ملزمة
لا أسرار في الكود (استخدم `.env`) · بيانات وهمية فقط في التطوير · عزل المستأجرين والصلاحيات يُفرضان في طبقة التفويض (يبدأ تطبيقهما في المرحلة 1–2 وفق ROADMAP).
