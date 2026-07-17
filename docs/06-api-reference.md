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

## 10ب. مسارات ما بعد الاكتمال (الإشعارات · CRM · التهيئة · التراجع · 360° · المالية · الوسطاء الفرعيون · القوالب)

### الإشعارات
| الطريقة | المسار | الحماية | الوصف |
|---|---|---|---|
| GET/PUT | `/notifications` · `/notifications/:key` | settings | إعدادات الشركة (تفعيل/تعطيل القناة + تعديل النص) |
| GET/PUT | `/platform/notifications` · `/platform/notifications/:key` | سوبر أدمن | الافتراضي المُورَّث |
| GET | `/notifications/inbox` · `/notifications/inbox/unread-count` | مصادقة | مركز الإشعارات (جرس الموظف) |
| POST | `/notifications/inbox/:id/read` · `/notifications/inbox/read-all` | مصادقة | تعليم كمقروء |
| GET/POST | `/portal/notifications` (+`/unread-count`, `/:id/read`) | بوّابة العميل | إشعارات العميل داخل بوّابته |

### CRM
| الطريقة | المسار | الحماية | الوصف |
|---|---|---|---|
| GET | `/crm/follow-up` | sales:read | لوحة «يحتاج متابعة» (عابرة للوحدات، تحترم الصلاحيات) |
| GET/POST | `/crm/deals` · GET `/crm/deals/:id` · PATCH `/crm/deals/:id` | sales | خطّ الأنابيب + تفاصيل الفرصة المُثراة (BOR/حصرية/القسط التقديري/نسبة الخسارة/المؤمِّنون المفضّلون). رؤية حسب الدور |
| POST | `/crm/deals/:id/convert` | sales:update | **تحويل الفرصة إلى طلب تأمين** (Lead ⇒ Request) — طلب DRAFT مبني على الفرصة + الصفقة won ومربوطة (تكرار ⇒ 409) |
| GET/POST | `/crm/tasks` (`?mine=1`) · POST `/crm/tasks/:id/complete` | sales | المهام/التذكيرات |
| GET/POST | `/crm/activities/:entityType/:entityId` · `/crm/activities` | sales | النشاط/الملاحظات (الخط الزمني) |
| POST | `/reminders/run` | sales:update | تشغيل مسح التذكيرات يدويًا (مقصور على مستأجر المُستدعي) — يُطلق تذكير المهام المستحقّة وتجديد الوثائق. يعمل تلقائيًا يوميًا عبر cron (`@nestjs/schedule`، 8ص). |

### سلسلة الاعتماد (E2) · التراجع (E4) · 360°
| الطريقة | المسار | الحماية | الوصف |
|---|---|---|---|
| GET/PUT | `/config/company` | settings | **بيانات الشركة** (اسم عربي/إنجليزي · سجل تجاري · رقم موحّد 10 · ضريبي 15 · جوال) — أرقام مُتحقَّقة الطول ⇒ 400 |
| GET/PUT | `/config/approval-chain` | settings | البوّابة الفنية + فصل المهام + الخطوات الإضافية |
| GET/PUT | `/config/security` | settings | سياسة الأمان — إلزام المصادقة الثنائية لكل الموظفين (`{ mfaRequired }`) |
| GET/PUT | `/config/retention` | settings | مدّة الاحتفاظ بالبيانات (`{ retentionYears }`، 1–30، افتراضي 10 — PDPL/هيئة التأمين) |
| GET/PUT | `/config/email` | settings | **بريد المستأجر (BYO Resend)**: `{ fromEmail, fromName, apiKey? }` — يُنشئ النطاق ويعيد DNS/الحالة. المفتاح masked لا خام |
| POST | `/config/email/verify` | settings:update | «تحقّق الآن» — يستعلم حالة النطاق ويرقّي لوضع `tenant` عند التوثيق |
| GET/PUT | `/config/payment` | settings | **بوّابة الدفع للمستأجر (BYO Tap/Moyasar)**: `{ provider, publicKey?, secretKey?, enabled?, currency? }` — المفتاح السرّي مشفّر at-rest، masked لا خام؛ الفارغ يُبقي القائم. لا تفعيل بلا بوّابة ومفتاح (400) |
| POST | `/portal/pay` | client (بوّابة) | **دفع إشعار مدين**: `{ debitNoteId, amount }` ⇒ شحنة عبر بوّابة المستأجر + رابط دفع. يتحقّق من الملكية والمتبقّي (تجاوز 400، إشعار غيره 404) |
| POST | `/portal/pay/:id/confirm` | client (بوّابة) | تأكيد بعد العودة — يطابق الحالة، وعند النجاح **يُنشئ سند قبض تلقائيًا** (شلال الأقساط). idempotent |
| POST | `/payments/webhook` | **عام** | إشعار البوّابة بالنتيجة — **يتحقّق من التوقيع** بمفتاح المستأجر ثم يُنشئ سند القبض (توقيع فاسد ⇒ 409). حتمي |
| GET/PUT | `/config/branding` | settings | **الهوية البصرية** (لون/اسم/شعار نصّي) — لون hex مُتحقَّق |
| POST | `/config/branding/logo` | settings:update | رفع شعار (data URL ≤512KB) ⇒ رابط عام ثابت |
| GET | `/branding` | مصادقة (أي دور) | هوية المستأجر الحالي — لتلوين الواجهة |
| GET | `/branding/:tenantId/logo` | **Public** | خدمة الشعار برابط عام ثابت (يظهر في البريد) |
| GET | `/portal/branding` | portal | هوية شركة الوساطة لتلوين بوّابة العميل |
| GET | `/audit` | compliance:read | **سجل تدقيق الشركة** — «من فعل ماذا ومتى» بأسماء المنفّذين + IP/الجهاز/الوقت (فلترة `?action=&entity=`). سجل ثابت (قراءة فقط) |
| GET · POST · PUT · DELETE | `/insurers` · `/insurers/:id` | finance:* + module.finance | **إدارة شركات التأمين**: سجلّ + نِسبة عمولة/دورة تسوية/حساب بنكي/ترخيص + **إحصاءات إنتاج فعلية** لكل شركة (عدد/أقساط/عمولة). نسبة>100 ⇒ 400 |
| GET | `/targets` · `/targets/options` | reports:read + module.reports | **أهداف الأداء** (P1-B): القائمة مع **الفعلي المحسوب و% الإنجاز** (فلترة `?period=`) · خيارات الإنشاء (منتِجون/فروع/مقاييس) |
| POST · DELETE | `/targets` · `/targets/:id` | reports:create/delete + module.reports | إنشاء هدف (وسيط فرعي/فرع · مقياس · فترة · قيمة) · حذف — قيمة غير موجبة ⇒ 400 |
| POST | `/clients/:id/erase` | clients:delete | **حق المحو (PDPL)** — يُخفي كل PII ويُبقي الهيكل المالي + سجلّ إتلاف ثابت (لا يتكرّر ⇒ 409) |
| GET | `/clients/erasures` · `/clients/retention/due` | clients:read | سجلّ الإتلاف (الممحوّون) · تقرير الاستحقاق للإتلاف (تجاوز مدّة الاحتفاظ). **DLP**: الهوية/الآيبان مُخفاة لغير الالتزام/المالية |
| GET | `/auth/mfa/status` | مصادقة | حالة MFA للمستخدم + إلزام الشركة |
| POST | `/auth/mfa/setup` · `/auth/mfa/enable` · `/auth/mfa/disable` | مصادقة | تسجيل/تفعيل/إلغاء MFA (TOTP، **مُطفأة افتراضيًا**). `login` بكلمة المرور وحدها ⇒ `401 MFA_REQUIRED`، ومع `mfaCode` ⇒ توكن |
| POST | `/staff/:id/mfa/reset` | settings:update | **إعادة تعيين إدارية**: أدمن الشركة يُعطّل مصادقة موظف (فقدان جهاز) — يعيد التسجيل لاحقًا |
| POST | `/policies/:id/approve-step` | ديناميكي (وحدة الخطوة) | اعتماد خطوة إضافية مُهيّأة |
| POST | `/revert/:entityType/:id` | `canRevert` للوحدة | التراجع خطوة للوراء (policy/claim/service_request/request) |
| GET | `/clients/:id/overview` | clients:read | نظرة العميل 360° المجمّعة |
| GET | `/staff/:id` | settings:read | تفاصيل الموظف 360° (بياناته + ما تحت مسؤوليته + نشاطه) |
| GET | `/auth/me` | مصادقة | يُرجِع الآن **خريطة صلاحيات المستخدم** (module ⇒ access/create/edit/delete/revert) |

### المالية — دورة التحصيل (سندات القبض + كشف الحساب)
| الطريقة | المسار | الحماية | الوصف |
|---|---|---|---|
| POST | `/finance/debit-notes/:id/receipt` | finance:create | سند قبض من العميل مقابل إشعار مدين — يزيد `settledAmount`، قيد متوازن (نقد/ذمم)، يمنع تجاوز المستحقّ (409). عند وجود خطة تقسيط: يُطبَّق على الأقساط **بالأقدم استحقاقًا** (waterfall) |
| GET | `/finance/debit-notes/:id/installments` | finance:read | جدول أقساط الإشعار — لكل قسط `seq`/`dueDate`/`amount`/`settled`/`outstanding`/الحالة (paid/partial/overdue/due) |
| POST | `/finance/debit-notes/:id/installments` | finance:create | **إنشاء خطة تقسيط**: `{ count (2–36), firstDueDate? }` — تقسّم الإجمالي على دفعات شهرية (الأخيرة تمتصّ التقريب) + ترحيل المُحصَّل سابقًا بالأقدم استحقاقًا. تكرار الخطة ⇒ 409 · عدد خارج المدى ⇒ 400 |
| POST | `/finance/commissions/:id/receipt` | finance:create | استلام عمولة من المؤمِّن — يضبط `receivedAmount`/الحالة (مستلمة/فرق تحصيل) |
| GET | `/finance/statement/:clientId` | finance:read | كشف حساب العميل: قيود (إشعارات مدين) + إشعارات دائنة + مدفوعات (سندات قبض) برصيد جارٍ |
| POST | `/finance/policies/:id/cancel` | finance:update | **إلغاء وثيقة** — قسط مُرتجَع نسبةً وتناسبًا + إشعار دائن للعميل (CNP) + **إشعار دائن للمؤمِّن (CNC)** يعكس العمولة + قيد عكسي + `CANCELLED` (تكرار ⇒ 409) |
| GET | `/finance/payables` | finance:read | المستحقّ للمؤمِّنين (أمانات) لكل مؤمِّن + أعمار الدَّين + المُسوّى + المتبقّي |
| POST | `/finance/insurers/settle` | finance:create | سند صرف (PYV) لتسوية مستحقّ مؤمِّن (يمنع التجاوز ⇒ 409) |
| GET | `/finance/trial-balance` | finance:read | ميزان المراجعة — أطراف القيود مجمّعة حسب الحساب + مؤشّر توازن |
| GET | `/finance/balance-sheet` | finance:read | **الميزانية العمومية** — أصول/خصوم/حقوق ملكية مُشتقّة من ميزان المراجعة + **صافي الدخل** (أرباح مُبقاة) · مؤشّر توازن · مذكرة الأمانات خارج الميزانية · قائمة غير المصنّف |
| GET | `/finance/ledger/:account` | finance:read | **دفتر الأستاذ** — حركة حساب مرتّبة زمنيًا (تاريخ/سند/بيان/مدين/دائن) بـ**رصيد جارٍ** · حساب مجهول ⇒ 404 |
| GET | `/finance/vat-return?from&to` | finance:read | **إقرار ض.ق.م** — ضريبة المخرجات (0203) − ضريبة المدخلات (0105) = صافي المستحقّ · قاعدة خاضعة قياسية · `refund` عند السالب · فترة اختيارية |
| GET | `/finance/posting-accounts` | finance:read | حسابات الترحيل (leaf) لمنتقي القيد اليدوي — تستثني العناوين |
| GET | `/finance/journal` | finance:read | سجلّ القيود اليدوية (سندات JRV) |
| POST | `/finance/journal` | finance:create | **قيد يومية/مصروف يدوي**: `{ description, date?, reference?, entries:[{account, debit?, credit?}] }` — يفرض ≥طرفين · مدين XOR دائن · **توازن (مدين=دائن)** · حساب ورقة (400/422 عند المخالفة) |
| GET | `/finance/employee-commissions` | finance:read | دفتر عمولات الموظفين — **استحقاق عند التحصيل** (متوقّعة/مستحقّة/مدفوعة/متبقّية لكل مندوب) |
| POST | `/finance/employee-commissions/:userId/settle` | finance:create | صرف عمولة موظف (سند PYV، حساب 05020) — يمنع تجاوز المتبقّي (409) |
| POST | `/staff/:id/commission-rate` | settings:update | ضبط نسبة عمولة/حافز الموظف (% من عمولة الوساطة، 0–100؛ null = بلا عمولة) |
| GET | `/finance/receivables` · `/finance/summary` | finance:read | تعيدان **المتبقّي بعد التحصيل والإشعارات الدائنة** + `collected` + `creditNotes` + `serviceFees` + حالة كل إشعار + `hasPlan` + **أعمار الذمم** (`aging` شرائح 0–30/31–60/61–90/+90 + `agingByClient` + `ageDays` لكل إشعار) |
| GET | `/finance/invoices` | finance:read | الفواتير الضريبية مع `kind` (COMMISSION على المؤمِّن / FEES على العميل) + `party` (الطرف) + حزمة ZATCA |
| GET | `/finance/invoices/:id/document` | finance:read | **بيانات وثيقة الفاتورة المطبوعة** (بائع/طرف/بنود/ZATCA) لتوليد فاتورة PDF بهوية المستأجر — مجهولة ⇒ 404 |

**تصويب اتجاه الفاتورة:** الاعتماد المالي يُصدِر فاتورة **العمولة على المؤمِّن** (`kind=COMMISSION`) و—عند وجود `policyFees`—فاتورة **رسوم الخدمة على العميل** (`kind=FEES`، إيراد COA `04020` + ضريبة مخرجات 15%)، وتُضاف الرسوم لإشعار مدين العميل. بوّابة العميل تعرض فواتير رسومه فقط.

### الوسطاء الفرعيون
| الطريقة | المسار | الحماية | الوصف |
|---|---|---|---|
| GET | `/producers` | finance:read | دفتر الوسطاء الفرعيين: لكل وسيط فرعي عدد وثائقه + القسط + العمولة المستحقّة + المُسوّى + المتبقّي |
| GET | `/producers/:id` | finance:read | تفصيل وسيط فرعي: بياناته + وثائقه + سندات صرفه + الدفتر |
| POST/PATCH | `/producers` · `/producers/:id` | finance:create / finance:update | إنشاء/تعديل وسيط فرعي (رمز `PRD-` + ترخيص الهيئة + نسبة عمولة) |
| POST | `/producers/:id/settle` | finance:create | **صرف عمولة الوسيط الفرعي** (PYV، قيد مصروف `05010` ⇒ نقد) — يمنع تجاوز المستحقّ (409) |

### مكتبة قوالب النماذج
| الطريقة | المسار | الحماية | الوصف |
|---|---|---|---|
| GET | `/form-templates` (`?line=CODE`) | sales:read | القوالب الفعّالة (اختيارياً حسب الخطّ)، الأكثر استخدامًا أولًا |
| GET | `/form-templates/:id` | sales:read | قالب واحد |
| POST/PATCH/DELETE | `/form-templates` · `/form-templates/:id` | sales:create/update/delete | إنشاء/تعديل/حذف قالب (خطّ منتج مجهول ⇒ 400) |
| POST | `/form-templates/:id/apply` | sales:read | **تطبيق قالب** — يزيد عدّاد الاستخدام ويعيد `base`+`blocks` للتعبئة |

### تفاصيل الوثيقة 360° · الاكتتاب المالي
| الطريقة | المسار | الحماية | الوصف |
|---|---|---|---|
| GET | `/policies/:id/overview` | production:read | نظرة الوثيقة 360° المجمّعة (العميل + الملحقات + المطالبات + إشعارات المدين + الفواتير + المستندات + النشاط + ملخّص مالي) |
| POST | `/policies/:id/endorsements` | production:create | إضافة ملحق على وثيقة مُصدَرة (نوع/تاريخ سريان/فرق قسط/سبب) ⇒ `POL-…/E{n}`. وثيقة غير مُصدَرة ⇒ 409، وثيقة الغير ⇒ 404 |
| POST | `/slips/:id/quotations` | production:create | يقبل الآن حقول مالية موسّعة: `sumInsured`/`policyFees`/`commissionRate`/`commissionAmount`/**`commissionVat`** — **ضريبة القسط** (15% قياسي؛ الحياة معفاة) و**ضريبة عمولة الوساطة** (15% دائمًا، ضريبة مخرجات الوسيط) تُحتسبان تلقائيًّا. انظر [10 — الاكتتاب](./10-underwriting-rfq.md) |

### بوّابة العميل — الخدمة الذاتية (نطاق `client`)
| الطريقة | المسار | الحماية | الوصف |
|---|---|---|---|
| GET | `/portal/policies/:id` | بوّابة العميل | تفاصيل وثيقة العميل + مطالباتها + مستنداتها (404 على وثيقة الغير) |
| POST | `/portal/claims` | بوّابة العميل | تقديم مطالبة ⇒ `RECEIVED` + إشعار فريق المطالبات (`assertOwnsPolicy` ⇒ 403 على وثيقة الغير) |
| GET | `/portal/claims/:id` | بوّابة العميل | تفاصيل مطالبة + **المحادثة الظاهرة فقط** (`visibility=client`، بعلامة `mine`) — مقصور على مطالبات العميل (غيره ⇒ 404) |
| POST | `/portal/claims/:id/reply` | بوّابة العميل | رد العميل على مطالبته ⇒ يُضاف للمحادثة الظاهرة + يُشعِر فريق المطالبات (`staff_claim_reply`) |
| PUT | `/portal/me` | بوّابة العميل | تحديث بيانات التواصل فقط (اسم التواصل/الجوال 05/الهاتف 01/البريد، مُتحقَّق) — الحقول المُتحقَّقة حكوميًّا غير قابلة للتعديل |
| POST | `/portal/service-requests` | بوّابة العميل | طلب خدمة (٦ أنواع) ⇒ `OPEN` + إشعار |
| GET | `/portal/service-requests/:id` | بوّابة العميل | تفاصيل طلب الخدمة + **المحادثة الظاهرة فقط** (`visibility=client`، بعلامة `mine`) — مقصور على طلبات العميل (غيره ⇒ 404) |
| POST | `/portal/service-requests/:id/reply` | بوّابة العميل | رد العميل ⇒ يُضاف للمحادثة الظاهرة + يُشعِر الموظف المُسنَد/الفريق (`staff_service_reply`) |
| POST | `/portal/policies/:id/renew` | بوّابة العميل | طلب تجديد (اختصار طلب خدمة `renewal`) |

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
| `POST` | `/policies/issue` | `production:create` + `module.production` | 201 |
| `GET` | `/policies` · `/policies/:id` | `production:read` + `module.production` | 200 |
| `POST` | `/policies/:id/approve-technical` | `production:update` + `module.production` | 200 |
| `POST` | `/finance/policies/:id/approve` | `finance:update` + `module.finance` | 200 |
| `GET` | `/documents` · `/documents/:id/url` | `clients:read` (وفق الكيان) | 200 |
| `POST` | `/documents/upload-url` | `clients:create` (حدّ الباقة `upload.maxFileMb`) | 201 |
| `PUT` · `GET` | `/documents/blob/:token` | Public (التوكن الموقّع هو التفويض) | 200 |
| `POST` | `/verification/yaqeen` · `/wathiq` · `/address` | `clients:update` | 200 |
| `POST` | `/verification/screening` | `compliance:update` | 200 |
| `GET` | `/verification/wallets` · `/checks` | `clients:read` | 200 |
| `GET` | `/renewals` | `production:read` + `module.production` | 200 |
| `POST` | `/renewals/:policyId/initiate` | `production:update` + `module.production` | 200 |
| `GET` · `POST` | `/service-requests` | `service:read` · `service:create` + `module.service` | 200/201 |
| `POST` | `/service-requests/:id/status` | `service:update` + `module.service` | 200 |
| `GET` | `/claims` · `POST` `/claims` · `POST` `/claims/:id/status` | `claims:*` + `module.claims` | 200/201 |
| `GET` | `/claims/:id` | `claims:read` + `module.claims` | تفاصيل المطالبة: بيانات العميل (مُخفاة PII بـDLP) + الوثيقة + خطّ زمني بأسماء الكُتّاب |
| `POST` | `/claims/:id/notes` | `claims:update` + `module.claims` | `{ body, visibility? }` — `internal` (داخلي) أو `client` (رد ظاهر + يُشعِر العميل `claim_reply`) |
| `GET`/`POST` | `/complaints` | `compliance:read`/`create` | **سجلّ الشكاوى**: قائمة (فلترة `?status&category`) / تسجيل `{category, source, subject, description, priority?, clientId?}` ⇒ `CMP-` + مهلة SLA + إشعار `staff_complaint_created` |
| `GET` | `/complaints/report` | `compliance:read` | **التقرير التنظيمي**: تجميع بالفئة/الحالة + التزام SLA % + متوسّط زمن المعالجة + المُصعَّدة/المتأخّرة |
| `GET`/`PUT` | `/complaints/:id` | `compliance:read`/`update` | تفاصيل (+خط زمني) / تحديث حالة/إسناد/أولوية |
| `POST` | `/complaints/:id/{resolve,escalate,notes}` | `compliance:update` | معالجة `{resolution}` · تصعيد للهيئة · ملاحظة داخلية |
| `GET` | `/staff` | `settings:read` | 200 |
| `GET` | `/staff/roles` | `settings:read` | 200 |
| `POST` | `/staff` | `settings:create` | 201 |
| `POST` | `/platform/login` | Public | 201 |
| `GET` | `/platform/tenants` · `/tenants/:id` | PlatformGuard (نطاق المنصّة) | 200 |
| `POST` | `/platform/tenants/:id/status` | PlatformGuard | 200 |
| `GET` | `/platform/plans` · `/usage` | PlatformGuard | 200 |
| `GET` | `/platform/leads` | PlatformGuard | **طلبات التواصل مع المبيعات** (Lead) — أحدث أولًا (لصفحة `/admin/leads`) |
| `POST` | `/platform/leads/:id/status` | PlatformGuard | تحديث حالة الطلب (`new`/`contacted`/`closed`) — حالة خاطئة ⇒ 400 |
| `POST` | `/platform/plans/:code/entitlements` | PlatformGuard | 201 |
| `PUT` | `/platform/plans/:code` | PlatformGuard | **حدّ المقاعد (`seatLimit`)** + الاسم/الأسعار |
| `GET` | `/staff/seats` | settings:read | مقاعد الشركة `{ used, limit, planName }` — الإنشاء يُرفَض 403 عند الحدّ |
| `POST` | `/portal/login` | Public | 201 |
| `GET` | `/portal/me` · `/policies` · `/requests` · `/claims` · `/statement` · `/documents` | PortalGuard (نطاق العميل) | 200 |
| `GET` | `/portal/documents/:id/url` | PortalGuard | 200 |
| `GET` | `/reports/dashboard` | `dashboard:read` | 200 |
| `GET` | `/reports/commissions` | `finance:read` + `module.finance` | 200 |
| `GET` | `/reports/production` · `/claims` · `/regulatory` · `/catalog` | `reports:read` + `module.reports` | 200 |
| `GET` | `/reports/bordereau?insurer&from&to` | `reports:read` + `module.reports` | 200 — كشف المؤمِّن الدوري (صافي للمؤمِّن = إجمالي − عمولة) |
| `GET` | `/finance/summary` · `/coa` · `/invoices` · `/receivables` | `finance:read` + `module.finance` | 200 |
| `GET` | `/compliance/overview` | `compliance:read` + `module.compliance` | 200 |
| `GET` | `/regulatory/status` | `settings:read` | 200 |
| `GET` · `PUT` | `/zatca/config` | `settings:read` · `settings:update` (VAT خاطئ ⇒ 422) | 200 |
| `POST` | `/zatca/onboard/{generate-csr,exchange-otp,run-compliance,finalize}` | `settings:update` | 200 |
| `GET` | `/zatca/billing-documents` | `finance:read` + `module.finance` | 200 |
| `POST` | `/zatca/reporting/drain` | `finance:update` + `module.finance` | 200 |

### التسجيل الذاتي والباقات (عام)
| الطريقة | المسار | الحماية | الوصف |
|---|---|---|---|
| GET | `/signup/plans` | **عام** | كتالوج الباقات: **سعر لكل مستخدم** شهري/سنوي + `trialDays` + **`slaResponseHours` (زمن استجابة الدعم)** + **نسبة التوفير** المحسوبة + الموديولز — **بلا سقف مستخدمين** |
| GET | `/signup/compare` | **عام** | مصفوفة **مقارنة الباقات**: (فئات × باقات × خلايا) مشتقّة من entitlements كل باقة (مشمول/إضافة/حسب الاستخدام/حصّة) — لصفحة `/compare` والقسم المدمج باللاندينق. تنعكس فيها تغييرات السوبر أدمن فورًا |
| POST | `/signup` | **عام** | تسجيل ذاتي — يقبل `planCode`/`cycle`/`seatCount` (بلا سقف) + **onboarding**: `unifiedNumber` (10 أرقام) · `vatNumber` (15) · `phone` (`05XXXXXXXX`). يزوّد المستأجر (اشتراك بالدورة والمقاعد + تجربة الباقة + **الأقسام السبعة + 12 دورًا مُعدًّا مسبقًا** + شجرة الحسابات) ويُسجّل الدخول |
| POST | `/signup/lead` | **عام** | **طلب «تواصل معنا» (Lead)** للمؤسسات الكبيرة — `name`/`email` (مطلوبان) + `company`/`phone`/`planCode`/`seats`/`message`. يُنشئ `Lead` لمتابعة المبيعات |
| PUT | `/platform/plans/:code` | سوبر أدمن | يعدّل **`priceMonthly`/`priceYearly` (لكل مستخدم)** + **`trialDays`** + **`slaResponseHours` (SLA)** (بلا حدّ مقاعد — التسعير لكل مستخدم) |
| POST | `/platform/plans/:code/entitlements` | سوبر أدمن | يفعّل/يعطّل أي ميزة/موديول لباقة (`INCLUDED`/`ADDON`/`METERED`/`QUOTA`/`DISABLED`) — ينعكس فورًا في `/signup/compare` |
| POST | `/billing/checkout` | مصادقة | الإجمالي = سعر المستخدم × المقاعد المشترَك بها |

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
- [28 — ZATCA Fatoora المرحلة 2](./28-zatca-phase2-fatoora.md) — مسارات `/zatca/*` (التهيئة والفوترة والتوجيه)
- الكود: المتحكّمات تحت [`apps/api/src/modules/`](../apps/api/src/modules/) · إعداد الحدود في [`main.ts`](../apps/api/src/main.ts)

## ملحق: مسارات أُضيفت (طبقة الإطلاق + ما قبل العرض) — السرد في [34](./34-post-completion-features.md)

| المسار | الصلاحية | الوظيفة |
|---|---|---|
| `GET /finance/overview` | `finance:read` | نظرة المالك: قائمة دخل مبسّطة + مؤشّرات صحة الأعمال + اتجاه 6 أشهر |
| `GET /catalog/stats` | مصادَق | الكتالوج + إحصاءات إنتاج المستأجر لكل فرع + جاهزية النموذج + نسبة الضريبة |
| `GET /documents/all` | مصادَق | المستودع المركزي لكل مستندات المستأجر (فلاتر: التصنيف/نوع الكيان/بحث) |
| `POST /staff/:id/product-scope` | `settings:update` | ضبط `allowedProductLines` للموظف (صلاحيات على مستوى المنتج) |
| `GET /service-requests/:id` · `/staff` | `service:read` | تفاصيل طلب الخدمة: **بيانات العميل الكاملة** (مُخفاة PII بـDLP) + الوثيقة + **خطّ زمني بأسماء الكُتّاب وطوابع زمنية تفصيلية** · الموظفون القابلون للإسناد |
| `POST /service-requests/:id/assign` · `/priority` · `/notes` | `service:update` | إسناد · أولوية · **ملاحظة**: `{ body, visibility? }` — `internal` (داخلي، الافتراضي) أو `client` (رد ظاهر للعميل في البوّابة + يُشعِره `service_reply`) |
| `GET/POST/PATCH/DELETE /insurers` | `finance:*` | سجلّ شركات التأمين + إحصاءات الإنتاج |
| `GET/POST/DELETE /targets` · `/targets/options` | `reports:*` | الأهداف والأداء |
| `GET/PUT /branding` · `GET /branding/:tenantId/logo` | مصادَق/عام | الهوية البصرية + الشعار العام |
| `GET/POST/PUT/DELETE /email/*` | `settings:*` | بريد BYO (ربط/تحقّق/اختبار) |
| `GET/PUT /config/company` | `settings:*` | بيانات الشركة + العنوان الوطني (ZATCA) |
| `GET /audit` | `compliance:read` | سجل التدقيق (بأسماء المنفّذين) — شركة/منصّة |
| `GET /platform/leads` · `POST /platform/leads/:id/status` | سوبر أدمن | طلبات التواصل (Leads) |
| `POST /policies/:id/endorsements` (مُحسَّن) | `production:*` | ملحق باتجاه مالي + ضريبة بنسبة الفرع (يولّد إشعار مدين/دائن) |

> **ملاحظة سلوكية:** `GET /requests` و`GET /policies` أصبحا **يُصفّيان حسب نطاق منتجات المستخدم** (فارغ = كل الفروع)؛ و`POST /finance/policies/:id/approve` صار **يتفرّع حسب آلية التحصيل** (تحصيل كامل/دفع مباشر) ويعيد `collectionModel`.
