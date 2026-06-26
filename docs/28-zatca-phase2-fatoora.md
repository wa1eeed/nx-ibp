# 28 — ZATCA Fatoora المرحلة 2 (Integration) — جاهزية متعددة المستأجرين

> توسعة المرحلة 4ب: بنية إنتاجية كاملة لجاهزية **ZATCA المرحلة 2 (Integration/Fatoora)** في بيئة SaaS متعددة المستأجرين — لكل شركة وساطة هويتها التشفيرية وعدّادها وسلسلة تجزئتها المستقلّة. التكامل الحكومي الفعلي عبر **بوّابة Sandbox** بنقطة تبديل واحدة للإنتاج (المرحلة 9)؛ أما التشفير وترميز QR وسلسلة التجزئة فحقيقية.

## جدول المحتويات
- [1. تهيئة ZATCA المعزولة لكل مستأجر](#1-تهيئة-zatca-المعزولة-لكل-مستأجر)
- [2. خطّ التهيئة (Onboarding) — 4 خطوات](#2-خطّ-التهيئة-onboarding--4-خطوات)
- [3. التسلسل وسلسلة التجزئة المعزولة](#3-التسلسل-وسلسلة-التجزئة-المعزولة)
- [4. مستند الفوترة الموحّد](#4-مستند-الفوترة-الموحّد)
- [5. ترميز QR (TLV) و UBL](#5-ترميز-qr-tlv-و-ubl)
- [6. التوجيه: B2B مقاصة · B2C إبلاغ](#6-التوجيه-b2b-مقاصة--b2c-إبلاغ)
- [7. الدمج الذرّي في الاعتماد المالي](#7-الدمج-الذرّي-في-الاعتماد-المالي)
- [8. الأمان والعزل](#8-الأمان-والعزل)
- [9. الـ endpoints والاختبارات](#9-الـ-endpoints-والاختبارات)

## 1. تهيئة ZATCA المعزولة لكل مستأجر

`TenantZatcaConfig` (جدول واحد يجمع هوية ZATCA + إعدادات الوساطة broker settings) — **سجل لكل مستأجر**:

| الحقل | الغرض |
|---|---|
| `vatNumber` | رقم ضريبي سعودي 15 رقماً (يبدأ وينتهي بـ 3) — يُتحقَّق دلالياً |
| `businessNameAr/En`, `environment` | اسم المنشأة، البيئة (SANDBOX/PRE_PRODUCTION/PRODUCTION) |
| `egsSerialNumber`, `onboardingStatus` | رقم وحدة EGS، حالة التهيئة |
| `privateKeyEnc`, `csrPem`, `complianceCsidEnc`, `productionCsidEnc`, `publicKey` | المفتاح الخاص و CSR و CCSID و PCSID — **مشفّرة at-rest (AES-256-GCM)** |
| `invoiceCounter`, `lastDocumentHash` | **عدّاد وتجزئة معزولان بالمستأجر** (anti-tampering) |

العزل المنطقي مفروض عبر طبقة العزل ([04](./04-security-and-multitenancy.md)): لا يقرأ مستأجر تهيئة أو سلسلة تجزئة مستأجر آخر.

## 2. خطّ التهيئة (Onboarding) — 4 خطوات

`ZatcaOnboardingService` بحالة `onboardingStatus`: `NOT_STARTED → CSR_GENERATED → COMPLIANCE_PASSED → ACTIVE`.

| الخطوة | المسار | الفعل |
|---|---|---|
| 1 | `POST /zatca/onboard/generate-csr` | توليد مفتاح **ECDSA secp256k1** (حقيقي) + CSR؛ يُشفَّر المفتاح ويُخزَّن ⇒ `CSR_GENERATED` |
| 2 | `POST /zatca/onboard/exchange-otp` | تبادل CSR + OTP (6 أرقام) ⇒ شهادة الامتثال (CCSID) مشفّرة |
| 3 | `POST /zatca/onboard/run-compliance` | دفع 3 مستندات (فاتورة/إشعار دائن/إشعار مدين) بصيغة UBL للتحقّق ⇒ `COMPLIANCE_PASSED` |
| 4 | `POST /zatca/onboard/finalize` | استبدال CCSID ⇒ شهادة الإنتاج (PCSID) ⇒ `ACTIVE` + `PRODUCTION` |

كل نداء حكومي يمرّ عبر `ZatcaGateway` (Sandbox محاكى؛ يُستبدَل بـ HTTP الحقيقي للهيئة في الإنتاج دون تغيير المستهلكين).

## 3. التسلسل وسلسلة التجزئة المعزولة

التزاماً بقواعد ZATCA لمنع التلاعب **دون تسرّب بين المستأجرين**:
- **عدّاد معزول**: `invoiceCounter` يزداد ذرّياً ضمن نطاق `tenantId` فقط (فاتورة المستأجر A رقم 5 مستقلّة عن المستأجر B). قيد `@@unique([tenantId, counter])` يضمن عدم التكرار.
- **سلسلة تجزئة معزولة**: `previousHash` لأي مستند = تجزئة آخر مستند **لنفس المستأجر** (`SHA-256` Base64، عبر `lastDocumentHash`).
- **UUIDv4** عالمي فريد لكل مستند.

## 4. مستند الفوترة الموحّد

`BillingDocument` (يُغني عن `Invoice`/`DebitNote`/`CreditNote` المبسّطة) — `documentType`: `TAX_INVOICE` (عمولة على شركات التأمين)، `DEBIT_NOTE` (قسط على العميل)، `CREDIT_NOTE` (استرداد/إلغاء)؛ و`invoiceSubtype`: `STANDARD_B2B` / `SIMPLIFIED_B2C`. يحمل كل حقول التعريب السعودي: التواريخ (إصدار/توريد بصيغة ZATCA)، المورِّد (لقطة من التهيئة)، العميل (اسم/عنوان/ضريبي أو سجل/هوية)، **بنود تفصيلية** (وصف/كمية/سعر/خصم/نسبة ضريبة/قيمة/صافٍ)، الإجماليات (قبل/ضريبة/شامل)، ومراجع التسوية (`billingReferenceId` + `reasonForIssuance`) للإشعارات. الرقم التسلسلي بصيغة `DNP-RUH-2026-JUN-10001`.

## 5. ترميز QR (TLV) و UBL

`ZatcaCryptoService` يبني حِمل QR بترميز **TLV** (Base64):

| الوسم | المحتوى | |
|---|---|---|
| 1–5 | اسم البائع · الرقم الضريبي · الطابع الزمني · الإجمالي شاملاً الضريبة · قيمة الضريبة | المرحلة 1 |
| 6 | تجزئة فاتورة XML | المرحلة 2 |
| 7 | التوقيع التشفيري (ECDSA) | المرحلة 2 |

ويُخزَّن `xmlPayload` (JSON) **يُحاكي UBL 2.1** (cbc:ID/UUID/IssueDate، AccountingSupplier/Customer، InvoiceLine، TaxTotal، LegalMonetaryTotal) جاهزاً للتسلسل إلى XML في المرحلة 9.

## 6. التوجيه: B2B مقاصة · B2C إبلاغ

`ZatcaInvoiceRouter` (يُستدعى **بعد** تثبيت المعاملة):
- **B2B (STANDARD)**: مقاصة فورية (Clearance) عبر البوّابة ⇒ تخزين الختم التشفيري وحالة `CLEARED`؛ لا يُسلَّم المستند قبل الختم.
- **B2C (SIMPLIFIED)**: توليد محلي فوري + إدراج في `ZatcaReportingQueue` (طابور Redis) للإبلاغ الخلفي خلال **24 ساعة** ⇒ `REPORTED`. (في الإنتاج: BullMQ worker/cron؛ هنا مُصرِّف خفيف + تصريف يدوي.)

## 7. الدمج الذرّي في الاعتماد المالي

`finance.approvePolicy` يلفّ كل شيء في معاملة قاعدة بيانات صارمة: تحويل الحالة إلى `ISSUED` + قيد JRV المتوازن + الحساب التحليلي + **توليد مستندات ZATCA** (`createInTx` — عدّاد/تجزئة/UUID/QR معزولة). أي فشل ⇒ تراجع كامل (صفر فساد بيانات). التوجيه (مقاصة/إبلاغ) يجري **بعد** التثبيت (لا نداءات خارجية داخل المعاملة).

## 8. الأمان والعزل

- **تشفير at-rest**: `CryptoVaultService` (AES-256-GCM، مفتاح من `ZATCA_ENC_KEY` في البيئة — لا أسرار في الكود). المفاتيح/الشهادات لا تُخزَّن خاماً ولا تُعاد إلا مُقنَّعة.
- **عزل المستأجرين** مفروض على التهيئة والعدّاد وسلسلة التجزئة والمستندات (مُثبَت: المستأجر A لا يقرأ تهيئة/سلسلة المستأجر B).

## 9. الـ endpoints والاختبارات

| المسار | الصلاحية |
|---|---|
| `GET/PUT /zatca/config` | `settings:read` / `settings:update` (تحقّق VAT ⇒ 422) |
| `POST /zatca/onboard/{generate-csr,exchange-otp,run-compliance,finalize}` | `settings:update` |
| `GET /zatca/billing-documents` | `finance:read` + `module.finance` |
| `POST /zatca/reporting/drain` | `finance:update` |

[`test/zatca.e2e-spec.ts`](../apps/api/test/zatca.e2e-spec.ts) — **8/8**: عزل التهيئة (كلٌّ يرى رقمه الضريبي فقط)، **422 لرقم ضريبي خاطئ**، خطّ التهيئة الكامل (CSR⇒OTP⇒Compliance⇒ACTIVE)، توليد مستندات (UUIDv4 + عدّاد + سلسلة تجزئة + QR)، التوجيه B2B (CLEARED) و B2C (REPORTED)، وعزل سلسلة التجزئة. الإجمالي التراكمي **e2e 103/103**.

## انظر أيضاً
- [20 — الإصدار والنواة المالية](./20-issuance-and-finance-core.md) · [27 — التكاملات التنظيمية](./27-regulatory-and-launch.md)
- [03 — نموذج البيانات](./03-data-model.md) — `TenantZatcaConfig`/`BillingDocument`
- [04 — الأمان والعزل](./04-security-and-multitenancy.md) — تشفير at-rest والعزل
