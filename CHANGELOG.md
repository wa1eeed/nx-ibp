# سجل التغييرات (Changelog)

كل التغييرات الملموسة في منصة IBP، منظّمة حسب المراحل. الصيغة مستلهمة من [Keep a Changelog](https://keepachangelog.com).

## [المرحلة 8أ] — لوحة السوبر أدمن (Platform Super Admin) ✅
- **نطاق منصّة عابر للمستأجرين**: كيان `PlatformAdmin` (بلا `tenantId`) + JWT بنطاق `scope:platform` ⇒ استعلامات Prisma غير مفلترة + `PlatformGuard` مستقلّ.
- عزل ثنائي الاتجاه مُثبَت: مستخدم المستأجر يُرفض من `/platform` (403)، ومدير المنصّة يُرفض من مسارات المستأجر (403).
- خدمة `platform`: دخول، قائمة/تفاصيل المستأجرين، تعليق/تفعيل الاشتراك (مُدقَّق)، الاستخدام الكلّي، و**إدارة الباقات والـ entitlements**.
- **التحكّم في حدّ رفع الملفات (وغيره) من اللوحة** عبر upsert للـ entitlement — لا قيم ثابتة في الكود (تنفيذ قرار المستخدم).
- واجهة `/[locale]/admin/*` منفصلة بـ token مستقلّ (`papi`): دخول، استخدام، مستأجرون، باقات — RTL وثنائية اللغة (namespace `admin`).
- اختبارات: e2e 68/68. توثيق: [`docs/24`](./docs/24-platform-super-admin.md). الفرع `phase-8a-superadmin`.

## [المرحلة 7] — التحقّق الحكومي KYC/KYB ✅
- طبقة موفّري التحقّق (Sandbox): يقين (هوية)، واثق (سجل/شركاء/UBO)، العنوان الوطني (مجاني)، فحص PEP/العقوبات.
- **تعبئة ذكية** للنموذج من نتيجة السحب + **خصم العملية** من المحفظة (Reseller) وتسجيلها في `TransactionLedger` و`VerificationCheck` والتدقيق.
- تصنيف مخاطر آلي (low/medium/high) للالتزام. ربط التحقّق بالعميل/الطلب.
- واجهة: صفحة التحقّق (أرصدة العمليات + سحب تجريبي + سجل) + عنصر تنقّل «التحقّق».
- اختبارات: e2e 60/60. توثيق: [`docs/23`](./docs/23-government-verification.md). الفرع `phase-7-verification`.

## [المرحلة 6] — الموديولز التشغيلية (Operational) ✅
- **خدمة العملاء** (`ServiceRequest`): طلبات إضافة/حذف/تعديل/استفسار/تجديد بدورة حالات (RQ-).
- **المطالبات** (`Claim`): دورة كاملة استقبال ← رفع ← تسوية ← إغلاق (CL-) محكومة بـ entitlement.
- **التجديدات**: الوثائق المستحقّة خلال نافذة + بدء تجديد (ServiceRequest type=renewal).
- واجهات: صفحات service/claims/renewals + عنصر «خدمة العملاء» في التنقّل وتفعيل المطالبات.
- اختبارات: e2e 53/53. توثيق: [`docs/22`](./docs/22-operational-modules.md). الفرع `phase-6-operations`.

## [المرحلة 5] — وحدة المستندات (Document Service) ✅
- وحدة مستندات موحّدة (polymorphic): رفع/عرض عبر **روابط موقّتة فقط** (Presigned، 5 دقائق) — لا روابط عامة.
- خدمة تخزين حيادية المزوّد (`STORAGE_DRIVER`: local/s3/minio/alibaba_oss/gcs) + عزل بالمسار `tenant_{id}/`.
- حد الرفع كـ **entitlement** للباقة (`upload.maxFileMb`)، فحص MIME (رفض التنفيذي)، تمييز الرسمي/المرفق (WebP)، وتسجيل كل رابط في التدقيق.
- اختبارات: e2e 45/45. توثيق: [`docs/21`](./docs/21-document-service.md). الفرع `phase-5-documents`.

## [المرحلة 4ب] — الإصدار والنواة المالية (Finance Core) ✅
- كيان `Policy` محسّن (premium/vat/commission/status) + `PolicyStatus` + مولّد تسلسلي بالفرع `POL-…`.
- **شجرة الحسابات (COA) 17 رقماً** مزروعة لكل مستأجر: المستوى 1/2 مقفل + فصل داخل/خارج الميزانية + مراكز التكلفة.
- وحدة `production`: إصدار من طلب AWARDED + **موافقة فنية**. وحدة `finance`: **اعتماد مالي** يولّد آلياً **قيد JRV مزدوجاً متوازناً** + إشعار مدين + فاتورة ضريبية + يفتح حساب العميل التحليلي — ذرّياً.
- واجهة: صفحة الوثائق بشلال الاعتماد + زر «إصدار» للطلبات المُسنَدة.
- اختبارات: e2e 39/39. توثيق: [`docs/20`](./docs/20-issuance-and-finance-core.md). الفرع `phase-4b-finance`.

## [المرحلة 4أ] — الاكتتاب الفني وعروض الأسعار (RFQ) ✅
- كيانات `Slip` (RFQ)، `Quotation` (هجينة: حقول معيارية + نص حر)، `Endorsement`.
- وحدة `underwriting`: إنشاء Slip (بوّابة الالتزام ⇒ الطلب QUOTING)، إضافة عروض، **جدول مقارنة آلي** (يحدّد الأرخص)، **Firm Order** ⇒ الطلب AWARDED. حماية `module.production`.
- واجهة: منضدة `/tenant/slips/[id]` + زر RFQ في قائمة الطلبات.
- **تهيئة بنية المرحلة 4ب** (stubs): `ChartOfAccount` (17 رقماً، مستويات، On/Off‑Balance، قفل 1/2)، `CostCenter`، `Voucher` (JRV/PYV/RCV/DPV)، `Invoice` ضريبية، `DebitNote`/`CreditNote`.
- اختبارات: e2e 36/36. الفرع `phase-4a-underwriting`.

## [المرحلة 3] — العملاء + الكتالوج + النموذج الديناميكي ✅
- محرّك نموذج **مدفوع بمخطط** (DSL في `@ibp/shared`) + كتالوج متنوّع (7 فئات/15 فرعاً: طبي/مركبات/ممتلكات/هندسي/بحري/عام/حياة).
- استبدال الجداول الأربعة الثابتة بمخزن عام `RequestBlockRow`.
- `Client`: كود تجاري + تفرّد + `complianceStatus` + **بوّابة الالتزام**.
- وحدات `catalog`/`clients`/`requests` + محرّك تحقّق عام.

## [المرحلة 2] — الصلاحيات (RBAC + Entitlements) ✅
- حارس موحّد (`@Authorize` + `AuthorizationGuard`): فحص entitlement الباقة + صلاحية الدور.
- وحدة `staff` (إنشاء موظف بمصفوفة) + شاشة الموظفين.

## [المرحلة 1] — المصادقة وعزل المستأجرين ✅
- JWT + سياق المستأجر (AsyncLocalStorage) + **Prisma middleware يفرض tenantId** + سجل تدقيق.

## [المرحلة 0] — التهيئة ✅
- monorepo (web/api/db/shared/infra)، Prisma + seed، Docker Compose، `/health`.
- تصليب العزل: تحويل `tenantId` إلى مفاتيح أجنبية حقيقية على مستوى DB.

---
التفاصيل الكاملة في [`docs/`](./docs/README.md) و[`ROADMAP.md`](./ROADMAP.md).
