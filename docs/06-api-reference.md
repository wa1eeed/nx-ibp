# 06 — مرجع الـ API (REST API Reference)

> مرجع REST كامل لـ IBP API (NestJS 10). لكل endpoint: الطريقة، المسار، الحماية (`@Public` أو فحص `module:action` + `entitlement`)، جسم الطلب (حقول الـ DTO مع التحقق)، شكل الاستجابة، رموز الأخطاء، ومثال `curl`. كل ما هنا مستخرج من المتحكّمات والـ DTOs الفعلية — المسارات مذكورة. البادئة الافتراضية: `http://localhost:4000` (`API_PORT`).

## جدول المحتويات
- [1. الاتفاقيات العامة](#1-الاتفاقيات-العامة)
- [2. معيار معالجة الأخطاء](#2-معيار-معالجة-الأخطاء)
- [3. المصادقة (Auth)](#3-المصادقة-auth)
- [4. الفحص الصحّي (Health)](#4-الفحص-الصحي-health)
- [5. الكتالوج (Catalog)](#5-الكتالوج-catalog)
- [6. العملاء (Clients)](#6-العملاء-clients)
- [7. الطلبات (Requests)](#7-الطلبات-requests)
- [8. طلبات الأسعار والاكتتاب (Slips / Underwriting)](#8-طلبات-الأسعار-والاكتتاب-slips--underwriting)
- [9. المطالبات (Claims)](#9-المطالبات-claims)
- [10. الموظفون (Staff)](#10-الموظفون-staff)
- [11. ملخّص كل المسارات](#11-ملخص-كل-المسارات)
- [12. انظر أيضاً](#12-انظر-أيضاً)

---

## 1. الاتفاقيات العامة

| البند | القيمة |
|---|---|
| البروتوكول | REST / JSON عبر HTTPS |
| المصادقة | `Authorization: Bearer <jwt>` (إلا مسارات `@Public`) |
| التحقق | `ValidationPipe` عالمي: `whitelist + forbidNonWhitelisted + transform` ([`main.ts`](../apps/api/src/main.ts)) |
| العزل | كل استجابة مفلترة بمستأجر التوكن تلقائياً (انظر [04](./04-security-and-multitenancy.md)) |
| التفويض | فحص مزدوج entitlement + RBAC على المسارات المعلَّمة بـ `@Authorize` (انظر [05](./05-rbac-and-entitlements.md)) |
| CORS | من `CORS_ORIGINS` فقط، `credentials: true` |

في الجداول أدناه يعني عمود **الحماية**:

- **Public** — `@Public()`، بلا مصادقة.
- **Auth** — مصادقة فقط (لا `@Authorize`؛ يكفي توكن صالح).
- **`module:action` + `entitlement`** — فحص مزدوج: صلاحية الدور على الموديول، وتفعيل الباقة (إن ذُكر entitlement).

---

## 2. معيار معالجة الأخطاء

الاستجابة الناجحة JSON خام (الكائن أو المصفوفة). الأخطاء بصيغة NestJS القياسية:

```json
{ "statusCode": 403, "message": "لا تملك صلاحية لهذا الإجراء (RBAC)", "error": "Forbidden" }
```

جدول الرموز المستخدمة عبر النظام:

| الرمز | المعنى | متى يحدث | المصدر |
|---|---|---|---|
| `400` | Bad Request | حقل زائد غير مُعرَّف في الـ DTO (`forbidNonWhitelisted`) | `ValidationPipe` |
| `401` | Unauthorized | بلا توكن أو توكن غير صالح على مسار محمي؛ بيانات دخول خاطئة | `JwtAuthGuard` / `AuthService` |
| `403` | Forbidden | الموديول خارج باقة المستأجر (entitlement) أو لا صلاحية للدور (RBAC) | `AuthorizationGuard` |
| `404` | Not Found | المورد غير موجود **أو** يخصّ مستأجراً آخر (العزل يحوّله إلى «غير موجود») | الخدمات |
| `409` | Conflict | خرق حوكمة (عميل غير معتمد، طلب مغلق) أو تكرار فريد (`P2002`) | الخدمات |
| `422` | Unprocessable Entity | فشل تحقّق **مخطط النموذج الديناميكي** (تحقّق المحتوى لا الشكل) | `RequestsService` |
| `503` | Service Unavailable | تبعية معطّلة في الفحص الصحّي الشامل | `HealthController` |

> فرق `400` عن `422`: الأول من `ValidationPipe` (شكل الـ DTO ثابت)؛ الثاني من محرّك التحقق ضد مخطط الفرع المتغيّر (`FormValidationService`)، ويعيد جسماً `{ message, errors }`.

---

## 3. المصادقة (Auth)

المصدر: [`auth.controller.ts`](../apps/api/src/modules/auth/auth.controller.ts) · [`auth.service.ts`](../apps/api/src/modules/auth/auth.service.ts).

### `POST /auth/login` — تسجيل الدخول

| | |
|---|---|
| الحماية | **Public** (`@Public()`) |
| الجسم | [`LoginDto`](../apps/api/src/modules/auth/dto/login.dto.ts) |

**حقول الجسم:**

| الحقل | النوع | التحقق |
|---|---|---|
| `email` | string | `@IsEmail()` |
| `password` | string | `@IsString()` `@MinLength(6)` |

**الاستجابة (`201`):**

```json
{
  "accessToken": "<jwt>",
  "user": { "id": "...", "email": "...", "fullName": "...", "tenantId": "...", "roleId": "..." }
}
```

**الأخطاء:** `401` بيانات دخول غير صحيحة (مستخدم غير موجود/غير `ACTIVE` أو كلمة مرور خاطئة) · `400` حقل زائد.

```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"waleed@gulf-demo.sa","password":"Passw0rd!"}'
```

### `GET /auth/me` — المستخدم الحالي

| | |
|---|---|
| الحماية | **Auth** (توكن فقط) |
| الجسم | — |

**الاستجابة (`200`):** `{ id, email, fullName, tenantId, roleId, status }` (للمستخدم صاحب التوكن، مفلتر بالمستأجر).

**الأخطاء:** `401` بلا توكن.

```bash
curl http://localhost:4000/auth/me -H "Authorization: Bearer $TOKEN"
```

---

## 4. الفحص الصحّي (Health)

المصدر: [`health.controller.ts`](../apps/api/src/modules/health/health.controller.ts) · [`health.service.ts`](../apps/api/src/modules/health/health.service.ts). المتحكّم كاملاً `@Public()`.

### `GET /health` — فحص شامل (DB + Redis)

| | |
|---|---|
| الحماية | **Public** |

**الاستجابة (`200`):**

```json
{
  "status": "ok",
  "uptimeSec": 123,
  "timestamp": "2026-06-23T10:00:00.000Z",
  "checks": { "database": "up", "redis": "up" }
}
```

**الأخطاء:** `503` إن كانت إحدى التبعيات `down` (الحالة `degraded`)، ويُعاد نفس الجسم ضمن الاستثناء.

```bash
curl http://localhost:4000/health
```

### `GET /health/live` — فحص حيّ (Liveness)

| | |
|---|---|
| الحماية | **Public** |

**الاستجابة (`200`):** `{ "status": "ok" }` — بلا فحص تبعيات.

```bash
curl http://localhost:4000/health/live
```

---

## 5. الكتالوج (Catalog)

بيانات مرجعية على مستوى المنصة (غير مفلترة بمستأجر). المصدر: [`catalog.controller.ts`](../apps/api/src/modules/catalog/catalog.controller.ts) · [`catalog.service.ts`](../apps/api/src/modules/catalog/catalog.service.ts). يكفي أن يكون المستخدم مصادَقاً.

### `GET /catalog` — شجرة الفئات والفروع

| | |
|---|---|
| الحماية | **Auth** |

**الاستجابة (`200`):** مصفوفة فئات، كل فئة `{ code, name, lines: [{ code, name }] }`.

```bash
curl http://localhost:4000/catalog -H "Authorization: Bearer $TOKEN"
```

### `GET /catalog/lines/:code` — فرع واحد مع مخطط نموذجه

| | |
|---|---|
| الحماية | **Auth** |
| المعامل | `code` (مسار) — كود الفرع |

**الاستجابة (`200`):** `{ code, name, class: { code, name }, formSchema: { version, baseFields, blocks } }`.

**الأخطاء:** `401` بلا توكن · `404` فرع غير موجود.

```bash
curl http://localhost:4000/catalog/lines/MOTOR_PRIVATE -H "Authorization: Bearer $TOKEN"
```

---

## 6. العملاء (Clients)

المصدر: [`clients.controller.ts`](../apps/api/src/modules/clients/clients.controller.ts) · [`clients.service.ts`](../apps/api/src/modules/clients/clients.service.ts).

### `GET /clients` — قائمة العملاء

| | |
|---|---|
| الحماية | `clients:read` + `module.clients` |

**الاستجابة (`200`):** مصفوفة `{ id, code, type, name, crNumber, complianceStatus, tenantId }`.

**الأخطاء:** `401` · `403` entitlement/RBAC.

```bash
curl http://localhost:4000/clients -H "Authorization: Bearer $TOKEN"
```

### `POST /clients` — إنشاء عميل

| | |
|---|---|
| الحماية | `clients:create` + `module.clients` |
| الجسم | [`CreateClientDto`](../apps/api/src/modules/clients/dto/create-client.dto.ts) |

**حقول الجسم:**

| الحقل | النوع | التحقق |
|---|---|---|
| `type` | `"CORPORATE" \| "INDIVIDUAL"` | `@IsIn([...])` (مطلوب) |
| `name` | string | `@IsString()` `@MinLength(2)` (مطلوب) |
| `crNumber` | string | اختياري |
| `nationalId` | string | اختياري |
| `email` | string | اختياري `@IsEmail()` |
| `phone` | string | اختياري |
| `city` | string | اختياري |
| `nationalAddress` | string | اختياري |

**الاستجابة (`201`):** العميل المُنشأ (يبدأ بـ `complianceStatus: "PENDING"`، وكود تجاري مولّد تلقائياً).

**الأخطاء:** `401` · `403` · `409` تكرار سجل تجاري/هوية/كود (`P2002`) · `400` حقل زائد أو فشل التحقق.

```bash
curl -X POST http://localhost:4000/clients \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"CORPORATE","name":"شركة الفهد","crNumber":"1010101010"}'
```

### `POST /clients/:id/compliance` — بوّابة الالتزام (اعتماد/رفض)

| | |
|---|---|
| الحماية | `compliance:update` (بلا entitlement) |
| رمز النجاح | **`200`** (`@HttpCode(200)`) |
| الجسم | [`ComplianceDto`](../apps/api/src/modules/clients/dto/compliance.dto.ts) |

**حقول الجسم:**

| الحقل | النوع | التحقق |
|---|---|---|
| `decision` | `"APPROVED" \| "REJECTED"` | `@IsIn([...])` (مطلوب) |
| `note` | string | اختياري |

**الاستجابة (`200`):** `{ id, name, complianceStatus, complianceNote, tenantId }`. يُسجَّل في التدقيق (`action: approve`).

**الأخطاء:** `401` · `403` (صلاحية compliance) · `404` عميل غير موجود · `400` فشل التحقق.

```bash
curl -X POST http://localhost:4000/clients/cl-fahd/compliance \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"decision":"APPROVED","note":"اكتمل التحقق"}'
```

### `GET /clients/:id` — عميل واحد

| | |
|---|---|
| الحماية | `clients:read` + `module.clients` |

**الاستجابة (`200`):** الحقول الكاملة للعميل.

**الأخطاء:** `401` · `403` · `404` غير موجود **أو** يخصّ مستأجراً آخر.

```bash
curl http://localhost:4000/clients/cl-fahd -H "Authorization: Bearer $TOKEN"
```

---

## 7. الطلبات (Requests)

محرّك طلب التأمين: يتحقّق من الحمولة ضد مخطط الفرع ويفرض بوّابة الالتزام. المصدر: [`requests.controller.ts`](../apps/api/src/modules/requests/requests.controller.ts) · [`requests.service.ts`](../apps/api/src/modules/requests/requests.service.ts).

### `GET /requests` — قائمة الطلبات

| | |
|---|---|
| الحماية | `sales:read` + `module.sales` |

**الاستجابة (`200`):** مصفوفة `{ id, sequenceNo, productLineCode, status, tenantId, createdAt, client: { id, name, code } }`.

**الأخطاء:** `401` · `403`.

```bash
curl http://localhost:4000/requests -H "Authorization: Bearer $TOKEN"
```

### `POST /requests` — إنشاء طلب

| | |
|---|---|
| الحماية | `sales:create` + `module.sales` |
| الجسم | [`CreateRequestDto`](../apps/api/src/modules/requests/dto/create-request.dto.ts) |

**حقول الجسم:**

| الحقل | النوع | التحقق |
|---|---|---|
| `clientId` | string | `@IsString()` (مطلوب) |
| `productLineCode` | string | `@IsString()` (مطلوب) |
| `base` | object | `@IsObject()` (مطلوب) — الحقول الأساسية المعبّأة |
| `blocks` | `Record<string, Array<object>>` | اختياري — صفوف الكتل المتكررة (مثل `{ members: [...], vehicles: [...] }`) |
| `details` | object | اختياري |

**الاستجابة (`201`):** `{ id, sequenceNo, status: "DRAFT", productLineCode, tenantId }` (مع تخزين صفوف الكتل ذرّياً).

**الأخطاء:**
- `401` / `403`.
- `404` العميل أو الفرع أو مخططه غير موجود.
- `409` العميل غير معتمد من الالتزام (حوكمة).
- `422` فشل التحقّق ضد مخطط الفرع — يعيد `{ message, errors }`.
- `400` حقل زائد.

```bash
curl -X POST http://localhost:4000/requests \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"clientId":"cl-fahd","productLineCode":"MOTOR_PRIVATE","base":{"sumInsured":80000}}'
```

### `GET /requests/:id` — طلب واحد

| | |
|---|---|
| الحماية | `sales:read` + `module.sales` |

**الاستجابة (`200`):** الطلب الكامل مع `base` و`client` و`blockRows`.

**الأخطاء:** `401` · `403` · `404`.

```bash
curl http://localhost:4000/requests/req-1 -H "Authorization: Bearer $TOKEN"
```

---

## 8. طلبات الأسعار والاكتتاب (Slips / Underwriting)

الاكتتاب الفني: طلب الأسعار (Slip/RFQ)، عروض شركات التأمين الهجينة، المقارنة الآلية، وأمر الإسناد. المصدر: [`slips.controller.ts`](../apps/api/src/modules/underwriting/slips.controller.ts) · [`slips.service.ts`](../apps/api/src/modules/underwriting/slips.service.ts).

### `GET /slips` — قائمة طلبات الأسعار

| | |
|---|---|
| الحماية | `production:read` + `module.production` |

**الاستجابة (`200`):** مصفوفة `{ id, sequenceNo, status, tenantId, createdAt, request: {...}, _count: { quotations } }`.

```bash
curl http://localhost:4000/slips -H "Authorization: Bearer $TOKEN"
```

### `POST /slips` — إنشاء طلب أسعار

| | |
|---|---|
| الحماية | `production:create` + `module.production` |
| الجسم | [`CreateSlipDto`](../apps/api/src/modules/underwriting/dto/create-slip.dto.ts) |

**حقول الجسم:**

| الحقل | النوع | التحقق |
|---|---|---|
| `requestId` | string | `@IsString()` (مطلوب) |
| `insurers` | string[] | اختياري — شركات التأمين المستهدفة |
| `notes` | string | اختياري |

**الاستجابة (`201`):** `{ id, sequenceNo, status: "SENT", requestId, insurers, tenantId }` (ويُحوَّل الطلب إلى `QUOTING`).

**الأخطاء:** `401` · `403` · `404` الطلب غير موجود · `409` العميل غير معتمد من الالتزام (حوكمة).

```bash
curl -X POST http://localhost:4000/slips \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"requestId":"req-1","insurers":["Tawuniya","Bupa"]}'
```

### `GET /slips/:id` — طلب أسعار واحد

| | |
|---|---|
| الحماية | `production:read` + `module.production` |

**الاستجابة (`200`):** الطلب مع `quotations` و`request` و`selectedQuotationId`.

**الأخطاء:** `401` · `403` · `404`.

### `GET /slips/:id/comparison` — جدول المقارنة الآلي

| | |
|---|---|
| الحماية | `production:read` + `module.production` |

**الاستجابة (`200`):** `{ slipId, sequenceNo, status, columns, rows, bestByPrice }` — `columns` أعمدة معيارية (rate/premium/vat/totalPremium/deductible/limit)، و`bestByPrice` معرّف أرخص عرض.

**الأخطاء:** `401` · `403` · `404`.

```bash
curl http://localhost:4000/slips/slip-1/comparison -H "Authorization: Bearer $TOKEN"
```

### `POST /slips/:id/quotations` — إضافة عرض شركة تأمين

| | |
|---|---|
| الحماية | `production:create` + `module.production` |
| الجسم | [`CreateQuotationDto`](../apps/api/src/modules/underwriting/dto/create-quotation.dto.ts) |

**حقول الجسم** (هجين: حقول معيارية رقمية + نص حر):

| الحقل | النوع | التحقق |
|---|---|---|
| `insurerName` | string | `@IsString()` `@MinLength(2)` (مطلوب) |
| `rate` | number | اختياري — النسبة % |
| `premium` | number | اختياري — القسط الصافي |
| `vat` | number | اختياري |
| `totalPremium` | number | اختياري |
| `deductible` | number | اختياري — مبلغ التحمل |
| `limit` | number | اختياري — حد التغطية |
| `validUntil` | string | اختياري (تاريخ) |
| `coverFields` | object | اختياري |
| `generalRemarks` | string | اختياري — نص حر |
| `additionalConditions` | string | اختياري — نص حر |

**الاستجابة (`201`):** العرض المُنشأ (ويُحوَّل الـ Slip إلى `QUOTED` إن كان `DRAFT`/`SENT`).

**الأخطاء:** `401` · `403` · `404` طلب الأسعار غير موجود · `409` الطلب مُغلق (`SELECTED`/`CLOSED`) — لا يمكن إضافة عروض.

```bash
curl -X POST http://localhost:4000/slips/slip-1/quotations \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"insurerName":"Tawuniya","premium":4200,"vat":630,"totalPremium":4830,"deductible":1000}'
```

### `POST /slips/:id/select` — أمر الإسناد (Firm Order)

| | |
|---|---|
| الحماية | `production:update` + `module.production` |
| رمز النجاح | **`200`** (`@HttpCode(200)`) |
| الجسم | [`SelectQuotationDto`](../apps/api/src/modules/underwriting/dto/select-quotation.dto.ts) |

**حقول الجسم:**

| الحقل | النوع | التحقق |
|---|---|---|
| `quotationId` | string | `@IsString()` (مطلوب) |

**الاستجابة (`200`):** `{ slipId, selectedQuotationId, requestStatus: "AWARDED" }` — يُعلَّم العرض `SELECTED` وبقية العروض `REJECTED`، والطلب يصبح `AWARDED`. يُسجَّل في التدقيق (`action: approve`, `entity: firm_order`).

**الأخطاء:** `401` · `403` · `404` طلب الأسعار أو العرض غير موجود ضمنه.

```bash
curl -X POST http://localhost:4000/slips/slip-1/select \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"quotationId":"q-1"}'
```

---

## 9. المطالبات (Claims)

المصدر: [`claims.controller.ts`](../apps/api/src/modules/claims/claims.controller.ts).

### `GET /claims` — قائمة المطالبات

| | |
|---|---|
| الحماية | `claims:read` + `module.claims` (فحص مزدوج كامل) |

**الاستجابة (`200`):** مصفوفة المطالبات (مفلترة بالمستأجر).

**الأخطاء:** `401` · `403` الموديول خارج الباقة (مثل باقة basic) أو لا صلاحية للدور.

```bash
curl http://localhost:4000/claims -H "Authorization: Bearer $TOKEN"
```

---

## 10. الموظفون (Staff)

إدارة موظفي المستأجر — محصورة بصلاحية موديول `settings`. المصدر: [`staff.controller.ts`](../apps/api/src/modules/staff/staff.controller.ts) · [`staff.service.ts`](../apps/api/src/modules/staff/staff.service.ts).

### `GET /staff` — قائمة الموظفين

| | |
|---|---|
| الحماية | `settings:read` (بلا entitlement) |

**الاستجابة (`200`):** مصفوفة `{ id, fullName, email, status, tenantId, role: { id, name, isPreset } }`.

**الأخطاء:** `401` · `403`.

```bash
curl http://localhost:4000/staff -H "Authorization: Bearer $TOKEN"
```

### `GET /staff/roles` — قوالب الأدوار الجاهزة

| | |
|---|---|
| الحماية | `settings:read` |

**الاستجابة (`200`):** أدوار `isPreset` مع صفوف صلاحياتها `{ id, name, permissions: [{ module, canAccess, canCreate, canEdit, canDelete }] }` — لتعبئة مصفوفة شاشة الإنشاء.

```bash
curl http://localhost:4000/staff/roles -H "Authorization: Bearer $TOKEN"
```

### `POST /staff` — إنشاء موظف بمصفوفة صلاحيات

| | |
|---|---|
| الحماية | `settings:create` |
| الجسم | [`CreateStaffDto`](../apps/api/src/modules/staff/dto/create-staff.dto.ts) |

**حقول الجسم:**

| الحقل | النوع | التحقق |
|---|---|---|
| `fullName` | string | `@IsString()` `@MinLength(2)` (مطلوب) |
| `email` | string | `@IsEmail()` (مطلوب) |
| `password` | string | `@IsString()` `@MinLength(6)` (مطلوب) |
| `roleName` | string | `@IsString()` `@MinLength(2)` (مطلوب) — اسم الدور المخصّص |
| `permissions` | `PermissionRowDto[]` | `@ValidateNested({ each })` — صف لكل موديول |

**`PermissionRowDto`:** `{ module (أحد الموديولز الـ12 عبر @IsIn), canAccess, canCreate, canEdit, canDelete: boolean }`.

**الاستجابة (`201`):** `{ id, fullName, email, status: "ACTIVE", tenantId, roleId }` — يُنشأ دور مخصّص (`isPreset: false`) + مستخدم في معاملة ذرّية، ويُسجَّل في التدقيق.

**الأخطاء:** `401` · `403` لا صلاحية `settings:create` · `409` البريد مستخدم مسبقاً · `400` فشل التحقق (بما فيه `module` غير معروف).

```bash
curl -X POST http://localhost:4000/staff \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "fullName":"موظف عملاء جديد","email":"newhire@gulf-demo.sa",
    "password":"Passw0rd!","roleName":"موظف عملاء",
    "permissions":[
      {"module":"dashboard","canAccess":true,"canCreate":false,"canEdit":false,"canDelete":false},
      {"module":"clients","canAccess":true,"canCreate":false,"canEdit":false,"canDelete":false}
    ]
  }'
```

---

## 11. ملخّص كل المسارات

| الطريقة | المسار | الحماية | رمز النجاح |
|---|---|---|---|
| `POST` | `/auth/login` | Public | 201 |
| `GET` | `/auth/me` | Auth | 200 |
| `GET` | `/health` | Public | 200 / 503 |
| `GET` | `/health/live` | Public | 200 |
| `GET` | `/catalog` | Auth | 200 |
| `GET` | `/catalog/lines/:code` | Auth | 200 |
| `GET` | `/clients` | `clients:read` + `module.clients` | 200 |
| `POST` | `/clients` | `clients:create` + `module.clients` | 201 |
| `POST` | `/clients/:id/compliance` | `compliance:update` | 200 |
| `GET` | `/clients/:id` | `clients:read` + `module.clients` | 200 |
| `GET` | `/requests` | `sales:read` + `module.sales` | 200 |
| `POST` | `/requests` | `sales:create` + `module.sales` | 201 |
| `GET` | `/requests/:id` | `sales:read` + `module.sales` | 200 |
| `GET` | `/slips` | `production:read` + `module.production` | 200 |
| `POST` | `/slips` | `production:create` + `module.production` | 201 |
| `GET` | `/slips/:id` | `production:read` + `module.production` | 200 |
| `GET` | `/slips/:id/comparison` | `production:read` + `module.production` | 200 |
| `POST` | `/slips/:id/quotations` | `production:create` + `module.production` | 201 |
| `POST` | `/slips/:id/select` | `production:update` + `module.production` | 200 |
| `GET` | `/claims` | `claims:read` + `module.claims` | 200 |
| `GET` | `/staff` | `settings:read` | 200 |
| `GET` | `/staff/roles` | `settings:read` | 200 |
| `POST` | `/staff` | `settings:create` | 201 |
| `POST` | `/platform/login` | Public | 201 |
| `GET` | `/platform/tenants` · `/tenants/:id` | PlatformGuard (نطاق المنصّة) | 200 |
| `POST` | `/platform/tenants/:id/status` | PlatformGuard | 200 |
| `GET` | `/platform/plans` · `/usage` | PlatformGuard | 200 |
| `POST` | `/platform/plans/:code/entitlements` | PlatformGuard | 201 |
| `POST` | `/portal/login` | Public | 201 |
| `GET` | `/portal/me` · `/policies` · `/requests` · `/claims` · `/statement` · `/documents` | PortalGuard (نطاق العميل) | 200 |
| `GET` | `/portal/documents/:id/url` | PortalGuard | 200 |
| `GET` | `/reports/dashboard` | `dashboard:read` | 200 |
| `GET` | `/reports/commissions` | `finance:read` + `module.finance` | 200 |
| `GET` | `/reports/production` · `/claims` · `/regulatory` · `/catalog` | `reports:read` + `module.reports` | 200 |
| `GET` | `/finance/summary` · `/coa` · `/invoices` · `/receivables` | `finance:read` + `module.finance` | 200 |
| `GET` | `/compliance/overview` | `compliance:read` + `module.compliance` | 200 |
| `GET` | `/regulatory/status` | `settings:read` | 200 |

> **نطاق المنصّة (Platform):** مسارات `/platform/*` لا تخضع لعزل المستأجر بل لبوّابة `PlatformGuard` المستقلّة (نطاق `scope:platform` عابر للمستأجرين). تفصيلها الكامل في [24 — لوحة السوبر أدمن](./24-platform-super-admin.md).

> **نطاق العميل (Portal):** مسارات `/portal/*` بنطاق `scope:client` — عزل مزدوج (مستأجر + عميل) عبر `PortalGuard`. تفصيلها في [25 — بوّابة العميل](./25-client-portal.md).

> رمز النجاح الافتراضي لـ `POST` في NestJS هو `201`؛ أُعيد ضبطه إلى `200` بـ `@HttpCode(200)` في `/clients/:id/compliance` و`/slips/:id/select` لأنهما عمليتا **حالة** (اعتماد/إسناد) لا إنشاء مورد.

---

## 12. انظر أيضاً

- [01 — نظرة عامة (Overview)](./01-overview.md)
- [02 — المعمار (Architecture)](./02-architecture.md) — تدفّق الطلب
- [03 — نموذج البيانات (Data Model)](./03-data-model.md) — الكيانات وراء كل استجابة
- [04 — الأمان وعزل المستأجرين](./04-security-and-multitenancy.md) — المصادقة والعزل ومعالجة `404` العابر للمستأجرين
- [05 — الصلاحيات و Entitlements](./05-rbac-and-entitlements.md) — تفصيل عمود «الحماية»
- [24 — لوحة السوبر أدمن](./24-platform-super-admin.md) — مسارات `/platform/*` ونطاق المنصّة
- [25 — بوّابة العميل](./25-client-portal.md) — مسارات `/portal/*` ونطاق العميل
- [26 — التقارير والتحليلات](./26-reports-and-analytics.md) — مسارات `/reports/*` والتفويض المتدرّج
- [27 — التكاملات التنظيمية](./27-regulatory-and-launch.md) — مسارات `/finance/*` · `/compliance/*` · `/regulatory/*` و ZATCA
- الكود: المتحكّمات تحت [`apps/api/src/modules/`](../apps/api/src/modules/) · إعداد الحدود في [`main.ts`](../apps/api/src/main.ts)
