# سجل التغييرات (Changelog)

كل التغييرات الملموسة في منصة IBP، منظّمة حسب المراحل. الصيغة مستلهمة من [Keep a Changelog](https://keepachangelog.com).

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
