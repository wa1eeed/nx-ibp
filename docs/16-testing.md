# 16 — الاختبارات (Testing)

> اختبارات IBP تركّز على المنطق الحرج: **عزل المستأجرين، الصلاحيات، الحسابات، والحوكمة** (GUIDELINES.md §4/§7). الطبقة الحالية: اختبارات تكامل e2e للـ API بـ **Jest + Supertest** ضد قاعدة مزروعة.

## جدول المحتويات
- [1. الإعداد](#1-الإعداد)
- [2. ملفات الاختبار والتغطية](#2-ملفات-الاختبار-والتغطية)
- [3. التشغيل](#3-التشغيل)
- [4. الإستراتيجية](#4-الإستراتيجية)

## 1. الإعداد

[`apps/api/test`](../apps/api/test):
- [`jest-e2e.json`](../apps/api/test/jest-e2e.json): إعداد Jest (ts-jest، `testRegex: .e2e-spec.ts$`، `testTimeout: 30000`).
- [`setup-e2e.ts`](../apps/api/test/setup-e2e.ts): يحمّل `.env` الجذر قبل تحميل وحدات التطبيق (JwtModule يقرأ `JWT_SECRET` عند الاستيراد).
- كل ملف يُنشئ التطبيق في الذاكرة عبر `Test.createTestingModule({ imports: [AppModule] })` ويختبره بـ Supertest (HTTP حقيقي عبر خادم Nest).

## 2. ملفات الاختبار والتغطية

| الملف | عدد | يغطّي |
|---|---|---|
| [`isolation.e2e-spec.ts`](../apps/api/test/isolation.e2e-spec.ts) | 8 | المصادقة (401)، كلمة مرور خاطئة (401)، **عزل المستأجرين** (كل مستأجر يرى عملاءه فقط، الوصول العابر بالمعرّف 404)، `/auth/me` |
| [`rbac.e2e-spec.ts`](../apps/api/test/rbac.e2e-spec.ts) | 10 | **بوّابة الباقة** (موديول خارج الباقة 403)، **بوّابة الدور** (موظف بلا صلاحية 403)، إدارة الموظفين، إنشاء موظف بمصفوفة تُطبَّق فعلاً |
| [`requests.e2e-spec.ts`](../apps/api/test/requests.e2e-spec.ts) | 13 | الكتالوج المتنوّع، **التحقّق حسب المنتج** (طبي/مركبات/حياة → 201، حمولة ناقصة → 422)، **بوّابة الالتزام** (قبل الاعتماد 409)، تفاصيل الطلب بكتله |
| [`underwriting.e2e-spec.ts`](../apps/api/test/underwriting.e2e-spec.ts) | 5 | حوكمة الالتزام على الـ Slip (409)، RBAC production (403)، **جدول المقارنة الآلي** (يحدّد الأرخص)، **Firm Order** ⇒ الطلب AWARDED، العزل |
| [`finance.e2e-spec.ts`](../apps/api/test/finance.e2e-spec.ts) | 3 | إصدار من طلب AWARDED، **اعتماد مالي يولّد قيد JRV مزدوجاً متوازناً** + فاتورة ضريبية، فصل داخل/خارج الميزانية |
| [`documents.e2e-spec.ts`](../apps/api/test/documents.e2e-spec.ts) | 6 | **روابط موقّتة فقط** (Presigned)، حدّ الرفع كـ entitlement، فحص MIME (رفض التنفيذي)، عزل المسار `tenant_{id}/` |
| [`operations.e2e-spec.ts`](../apps/api/test/operations.e2e-spec.ts) | 9 | خدمة العملاء (دورة `RQ-`)، **المطالبات** (`CL-` محكومة بـ entitlement)، التجديدات، **بدء دورة تجديد** (⇒ 201 طلب تأمين DRAFT + منع تكرار 409)، RBAC والعزل |
| [`verification.e2e-spec.ts`](../apps/api/test/verification.e2e-spec.ts) | 7 | يقين يعبّئ النموذج و**يخصم عملية**، واثق (UBO)، العنوان مجاني، فحص PEP (low/high)، منع RBAC والعزل |
| [`platform.e2e-spec.ts`](../apps/api/test/platform.e2e-spec.ts) | 8 | دخول السوبر أدمن، **رؤية كل المستأجرين عابرةً للعزل**، رفض المستأجر من `/platform` ورفض المنصّة من مسارات المستأجر (403)، الاستخدام، ضبط entitlement، تعليق/تفعيل |
| [`portal.e2e-spec.ts`](../apps/api/test/portal.e2e-spec.ts) | 18 | دخول العميل، الملف/الوثائق/المطالبات/كشف الحساب/المستندات، **العزل المزدوج** (عميل مستأجر آخر، موظف ممنوع، عميل ممنوع من مسارات المستأجر، رابط مستند لا يملكه 404)، **الخدمة الذاتية** (تفاصيل وثيقة · تقديم مطالبة/طلب خدمة/تجديد 201 · عزل التقديم/التفاصيل 403/404) |
| [`reports.e2e-spec.ts`](../apps/api/test/reports.e2e-spec.ts) | 9 | لوحة/عمولات/إنتاج/مطالبات/هيئة التأمين بأرقام حقيقية، **التفويض المتدرّج** (basic ⇒ 403 من التحليلات، 200 من اللوحة)، العزل |
| [`regulatory.e2e-spec.ts`](../apps/api/test/regulatory.e2e-spec.ts) | 7 | **ZATCA** (فكّ TLV للحقول الخمسة)، الملخّص المالي/الأمانات، شجرة الحسابات، الذمم، لوحة الالتزام (`module.compliance` ⇒ 403)، حالة التكاملات (Sandbox) |
| [`zatca.e2e-spec.ts`](../apps/api/test/zatca.e2e-spec.ts) | 8 | **ZATCA المرحلة 2**: عزل التهيئة وسلسلة التجزئة، 422 لرقم ضريبي خاطئ، خطّ التهيئة (CSR⇒OTP⇒Compliance⇒ACTIVE)، توليد المستندات (UUID/عدّاد/تجزئة/QR)، التوجيه B2B/B2C |

**ملفات ما بعد الاكتمال** (هذه الجلسة): `security` · `mfa` · `signup` · `billing` · `org` · `storage-s3` · `storage-quota` · `image-compression` · `broker-fields` · `audit-immutable` · `notifications` — تغطّي التحصين الأمني (قفل/MFA)، التسجيل الذاتي، الفوترة (Tap seam)، الأقسام، التخزين السحابي/الحصص/الضغط، إثراء الحقول، **سجل التدقيق الثابت + IP**، ونظام الإشعارات.

**+ ملفات ما بعد الاكتمال:** `security` · `mfa` · `audit-immutable` · `signup` · `billing` · `org` · `storage-quota` · `storage-s3` · `image-compression` · `broker-fields` · `notifications` · `notification-gateway` · `staff-notifications` (توجيه + in-app) · `vat-branch` (E1) · `approval-chain` (E2 + فصل مهام) · `revert` (E4) · `crm` (7: أنابيب/مهام/نشاط/رؤية حسب الدور/لوحة متابعة/**مجدول التذكيرات: مهمة مستحقّة ⇒ تذكير بلا تكرار**/عزل التشغيل) · `detail-360` (نظرة العميل/الموظف + عزل) · `mfa-staff` (7: إعداد/تفعيل TOTP · تحدّي الدخول من خطوتين · إلزام الشركة + منع الإلغاء · **إعادة تعيين إدارية** · عزل صلاحية) · `retention-dlp` (6: إخفاء الهوية/الآيبان حسب الصلاحية · محو PDPL + عدم تكرار · سجلّ الإتلاف · عزل 403 · حدود مدّة الاحتفاظ · تقرير الاستحقاق) · `plan-seats` (4: سوبر أدمن يعدّل حدّ المقاعد · عرض مقاعد الشركة · **إنشاء مستخدم يُرفَض 403 عند الحدّ وينجح بعد رفعه** · عزل نطاق المنصّة).

**الإجمالي: 213 اختباراً (34 ملفاً).**

### قاعدة اختبار منفصلة (`ibp_test`)

منذ المرحلة 8ب، تعمل الاختبارات على قاعدة **`ibp_test`** مستقلّة كي لا تلوّث بيانات العرض في `ibp_dev`. الآلية: [`setup-e2e.ts`](../apps/api/test/setup-e2e.ts) يحمّل `.env` ثم **يتجاوز `DATABASE_URL`** من [`.env.test`](../.env.test) إن وُجد. التهيئة لمرّة واحدة:

```bash
pnpm --filter @ibp/db test:setup   # migrate deploy + seed على ibp_test
pnpm --filter @ibp/api test:e2e    # الاختبارات تعمل على ibp_test تلقائياً
```

## 3. التشغيل

```bash
# تتطلّب قاعدة مزروعة:
pnpm db:seed
pnpm --filter @ibp/api test:e2e
```
المتوقّع: `Test Suites: 4 passed`, `Tests: 36 passed`.

## 4. الإستراتيجية

- **اختبارات تكامل حقيقية:** تستخدم القاعدة المزروعة (مستأجران، أدوار، باقات) — تختبر الـ stack كاملاً (middleware → guards → service → Prisma → DB).
- **عزل صريح:** كل ميزة حسّاسة (عزل، RBAC، entitlement، حوكمة) لها اختبار منع صريح (مستأجر/دور لا يرى ما لا يخصّه).
- **idempotency:** الاختبارات التي تُنشئ بيانات تستخدم معرّفات/أرقاماً فريدة (مثل `Date.now()`) لتُعاد بأمان؛ واختبار العزل لا يثبّت أعداداً ثابتة.
- **التوسّع:** اختبارات الوحدة لمحرّك التحقّق والحسابات المالية تُضاف مع المرحلة 4ب وما بعدها (GUIDELINES.md §7 #4).

## انظر أيضاً
- [04 — الأمان وعزل المستأجرين](./04-security-and-multitenancy.md) · [05 — الصلاحيات](./05-rbac-and-entitlements.md)
- [08 — دورة حياة الصفقة](./08-deal-lifecycle-workflows.md) — الحوكمة المُختبَرة
- [18 — سير العمل و خارطة الطريق](./18-git-workflow-and-roadmap.md) — «تعريف تمّ»
