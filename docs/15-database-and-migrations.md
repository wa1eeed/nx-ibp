# 15 — قاعدة البيانات والترحيلات (Database & Migrations)

> PostgreSQL + Prisma 5. المخطط في [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma) (المصدر الوحيد للبنية). هذا الملف يوثّق إعداد Prisma، الترحيلات، بيانات الزرع، والأنماط المعمارية لقاعدة البيانات.

## جدول المحتويات
- [1. حزمة @ibp/db](#1-حزمة-ibpdb)
- [2. الترحيلات (Migrations)](#2-الترحيلات-migrations)
- [3. بيانات الزرع (Seed)](#3-بيانات-الزرع-seed)
- [4. أنماط معمارية](#4-أنماط-معمارية)
- [5. الأوامر](#5-الأوامر)

## 1. حزمة @ibp/db

[`packages/db`](../packages/db) تحوي المخطط والترحيلات والزرع وتُصدّر عميل Prisma:
- **مخرج مخصّص:** `generator.output = ../generated/client` لتفادي تعارض pnpm في الـ monorepo.
- `index.js`/`index.d.ts` يعيدان تصدير العميل المولّد (بلا خطوة بناء)، فيستهلكه الـ API عبر `import { PrismaClient } from "@ibp/db"`.
- الـ API يلفّ العميل في [`PrismaService`](../apps/api/src/prisma/prisma.service.ts) ويُركّب عليه middleware العزل (انظر [04](./04-security-and-multitenancy.md)).

## 2. الترحيلات (Migrations)

| الترحيل | المرحلة | ماذا فعل |
|---|---|---|
| `..._init` | 0 | إنشاء كل الجداول الأساسية (32 جدولاً) |
| `..._tenant_isolation_fks` | 0 (تصليب) | تحويل `tenantId` إلى **مفتاح أجنبي حقيقي** على كل الجداول التشغيلية (13 FK) لفرض العزل على مستوى DB |
| `..._user_password_hash` | 1 | `User.passwordHash` (bcrypt) |
| `..._clients_and_dynamic_form` | 3 | تحسين `Client` (كود تجاري + تفرّد + `complianceStatus`)؛ استبدال الجداول الأربعة الثابتة بـ `RequestBlockRow` العام |
| `..._underwriting_and_finance_prep` | 4أ | `Slip`/`Quotation`/`Endorsement`؛ تهيئة بنية 4ب (`ChartOfAccount` بـ17 رقماً ومستويات وOn/Off‑Balance، `CostCenter`، `Voucher` بـ enum، `Invoice` ضريبية، `DebitNote`/`CreditNote`) |
| … (مراحل 5–9 + ZATCA P2 + طبقة ما بعد الاكتمال) | 5–9 | `Claim`/`ServiceRequest`/`Renewal`، الإشعارات، سلاسل الاعتماد، MFA، الاحتفاظ/DLP، الوسطاء الفرعيون، `TenantEmailSettings`/`Target`/`Insurer`/`Lead`، `Plan.slaResponseHours` … |
| `..._service_request_assignee_priority` | خدمة | `ServiceRequest`: `assigneeId`/`priority`/`updatedAt` (تطوير موديول الخدمة) |
| `..._zatca_addresses_buyer_vat` | ZATCA | عنوان وطني للبائع (`Tenant`) + `vatNumber`/`nationalAddress` للمؤمِّن (`Insurer`) |
| `..._user_product_scope` | صلاحيات | `User.allowedProductLines String[]` (صلاحيات على مستوى المنتج، متوافقة رجعيًا) |
| `..._collection_model` | مالية | `Client.collectionModel` (افتراضي `collect_full`) + `Policy.collectionModel` (مبصوم) — نموذج التحصيل #32 |

> في البيئات غير التفاعلية، تُولَّد بعض الترحيلات بـ `prisma migrate diff` ثم تُطبَّق بـ `prisma migrate deploy`. **كل الترحيلات الأخيرة إضافية بقيَم افتراضية** (آمنة على بيانات قائمة).

## 3. بيانات الزرع (Seed)

[`packages/db/prisma/seed.ts`](../packages/db/prisma/seed.ts) — **بيانات وهمية فقط** (idempotent، كلمة مرور التطوير `Passw0rd!`):
- **مستأجران** لإثبات العزل: «وكالة الخليج» (premium + إضافة مطالبات) و«شركة الأمان» (basic).
- **الباقات** (basic/premium/enterprise) + **مصفوفة entitlements** لكل باقة (موديولز INCLUDED/ADDON/DISABLED + ميزات).
- **12 دور preset** لكل مستأجر (من `@ibp/shared/rbac.ts`) بـ 144 صلاحية.
- **مستخدمون** بأدوار متنوّعة (مدير عام، مبيعات، مطالبات، محاسبة، التزام، تسعير) — لاختبار RBAC.
- **الكتالوج** (10 فئات/47 فرعاً) + **FormSchemas** الغنية لكل فرع.
- **عملاء** بكود تجاري وحالات التزام (بعضهم PENDING لاختبار البوّابة).
- موفّرو التحقّق، المحافظ، وإضافة المطالبات لتنانت الخليج.

## 4. أنماط معمارية

- **العزل بـ FK:** كل جدول تشغيلي يحمل `tenantId` كمفتاح أجنبي إلى `Tenant` + فهرس — إدراج صفّ بمستأجر وهمي يُرفض على مستوى DB.
- **`RequestBlockRow` العام:** مخزن موحّد لصفوف الكتل المتكررة (تابعون/مركبات/أرواح...) لأي منتج — مدفوع بمخطط `FormSchema` بدل جداول ثابتة (انظر [09](./09-dynamic-form-engine.md)).
- **حقول Json:** `PolicyRequest.base/details`, `FormSchema.baseFields/blocks`, `Quotation.coverFields`, `Voucher.lines` — مرونة مع تحقّق على حدود الـ API.
- **تفرّد لكل مستأجر:** `@@unique([tenantId, ...])` على `Client.code/crNumber/nationalId`, `Branch.code`, `ChartOfAccount.code` (NULL لا يتعارض).

## 5. الأوامر

```bash
pnpm db:generate          # توليد العميل
pnpm db:migrate           # ترحيل تطويري (يطلب اسماً)
pnpm db:migrate:deploy    # تطبيق الترحيلات الجاهزة (غير تفاعلي)
pnpm db:seed              # الزرع
pnpm db:studio            # واجهة استعراض
pnpm db:reset             # إعادة ضبط + إعادة الزرع
```
سكربتات `db:*` تحمّل `.env` الجذر عبر `dotenv-cli`.

## انظر أيضاً
- [03 — نموذج البيانات](./03-data-model.md) — مرجع كل النماذج
- [04 — الأمان وعزل المستأجرين](./04-security-and-multitenancy.md) — middleware العزل
- [13 — التشغيل المحلي](./13-local-setup-and-operations.md)
