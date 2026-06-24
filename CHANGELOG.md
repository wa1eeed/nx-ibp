# سجل التغييرات (Changelog)

كل التغييرات الملموسة في منصة IBP، منظّمة حسب المراحل. الصيغة مستلهمة من [Keep a Changelog](https://keepachangelog.com).

## [إثراء البيانات] — بيانات شبه واقعية عبر كل المنصّة ✅
- `seedRichData()`: توسيع البذرة لتملأ كل صفحة — **21 عميلاً · 25 وثيقة · 10 مطالبات** + طلبات بمراحل مختلفة، عروض أسعار (RFQ + Quotations)، خدمة عملاء، فحوص KYC/PEP، إشعارات مدينة وفواتير وعمولات، ملاحق، مستندات، ومستخدمي بوّابة.
- أسماء/شركات تأمين/مدن سعودية واقعية + أفراد ومنشآت عبر 14 فرع تأمين و16 شركة تأمين.
- **إضافة آمنة**: معرّفات جديدة لا تمسّ كيانات الاختبارات (`cl-fahd`/`cl2-nukhba`)؛ خُفّفت تأكيدات مجاميع العمولات في `reports.e2e` لتكون متينة أمام نموّ البيانات. **e2e 95/95** يبقى أخضر.
- دخول بوّابة إضافي: `portal@naseej.sa` · `portal@salamah-hospital.sa` · `portal@redsea-dev.sa` · `portal@rimal.sa`.

## [المرحلة 9] — التكاملات التنظيمية والإطلاق (Regulatory & Launch) ✅
- **ZATCA (Fatoora) المرحلة 1**: مولّد رمز QR بترميز TLV (الحقول الخمسة) + بصمة SHA-256 + UUID؛ يُرفق بكل فاتورة عبر `/finance/invoices`.
- **النواة المالية الحيّة**: `/finance/{summary,coa,invoices,receivables}` — الفصل الائتماني (أمانات خارج الميزانية)، شجرة الحسابات 17 رقماً، الذمم حسب العميل.
- **لوحة الالتزام**: موديول `compliance` (`/compliance/overview`) — حالة العملاء + توزيع مخاطر PEP/العقوبات (`module.compliance`).
- **طبقة التكاملات التنظيمية**: موديول `regulatory` (`/regulatory/status`) — 9 موصِّلات حكومية (Sandbox في التطوير) + صفحة الإعدادات ← التكاملات.
- **استكمال كل الصفحات**: بُنيت `finance`/`premiums`/`compliance`/`settings/integrations` وأُزيل `comingSoon` — لا صفحات ناقصة.
- **النشر داخل المملكة**: `infra/k8s` (نشر+HPA+TLS+تقوية) و`infra/terraform` (حياديّ سحابياً + حارس توطين داخل المملكة + تشفير).
- بذرة: عمليات تحقّق KYC/PEP (low/medium/high) + إضافة `module.compliance` لـ demo-tenant.
- اختبارات: e2e 95/95 (regulatory: 7). توثيق: [`docs/27`](./docs/27-regulatory-and-launch.md). الفرع `phase-9-regulatory`.

## [المرحلة 8ج] — التقارير والتحليلات (Reports & Analytics) ✅
- **ربط الواجهات ببيانات حيّة**: تحوّلت لوحة التحكّم وصفحة العمولات من `@/lib/mock` إلى مكوّنات عميل تجلب من `/reports/*`.
- وحدة `reports`: dashboard, commissions, production, claims, regulatory, catalog — تجميعات `aggregate`/`groupBy` مفلترة تلقائياً بالمستأجر.
- كيان `Commission` المبسّط ⇐ **قيد عمولة كامل** (وثيقة/شركة/عميل/نسبة/متوقّع/مستلم/حالة/شهر) + migration `commission_ledger`.
- **تفويض متدرّج**: اللوحة `dashboard:read` (للجميع)، العمولات `module.finance` (للجميع)، التحليلات وتقارير الهيئة `module.reports` (مدفوع) — basic بلا الإضافة يُرفض (403).
- صفحة `/tenant/reports` جديدة (إنتاج/مطالبات/هيئة التأمين + كتالوج الـ12) + تفعيل عنصر «التقارير» في التنقّل.
- بذرة عمولات + وثيقة مستحقّة للتجديد وطلب قيد المراجعة (إثراء مؤشّرات اللوحة).
- اختبارات: e2e 88/88 (reports: 9). توثيق: [`docs/26`](./docs/26-reports-and-analytics.md). الفرع `phase-8c-reports`.

## [المرحلة 8ب] — بوّابة العميل (Client Portal) ✅
- **النطاق الأمني الثالث `client`**: كيان `ClientUser` (tenantId + clientId) + JWT `scope:client` + `PortalGuard`.
- **عزل مزدوج**: فلترة Prisma بـ `tenantId` (الطبقة القائمة) + فلترة صريحة بـ `clientId` في `PortalService` ⇒ العميل يرى بياناته هو فقط.
- وحدة `portal`: login, me, policies, requests (تأمين+خدمة), claims, statement (إشعارات مدين+فواتير+رصيد), documents + رابط موقّت بفحص ملكية.
- واجهة `/[locale]/portal/*` بـ token مستقلّ (`cpapi`): dashboard/policies/requests/claims/statement/documents + `PortalShell` — RTL وثنائية اللغة (namespace `portal`).
- **بذرة تشغيلية كاملة**: وثائق/طلبات/خدمة/مطالبات/إشعارات مدينة/فواتير/مستندات + مستخدمو بوّابة (`portal@alfahd.sa`, `portal@nukhba.sa`).
- **قاعدة اختبار منفصلة `ibp_test`** (عبر `.env.test`) كي لا تلوّث الاختبارات بيانات العرض في `ibp_dev`.
- اختبارات: e2e 79/79 (portal: 11). توثيق: [`docs/25`](./docs/25-client-portal.md). الفرع `phase-8b-portal`.

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
