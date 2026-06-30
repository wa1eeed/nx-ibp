# 11 — الواجهة ونظام التصميم (Frontend & Design System)

> واجهة IBP مبنية بـ **Next.js 14 (App Router) + TypeScript + Tailwind + next-intl**، بدعم RTL وثنائية اللغة من الأساس. هذا الملف يوثّق بنية التطبيق، التوجيه، قشرة المستأجر، الصفحات، عميل الـ API، عارض النموذج الديناميكي، ونظام التصميم (design tokens) المستمدّ من `design-references/`.

## جدول المحتويات
- [1. البنية والتوجيه](#1-البنية-والتوجيه)
- [2. قشرة المستأجر (Shell)](#2-قشرة-المستأجر-shell)
- [3. الصفحات](#3-الصفحات)
- [4. عميل الـ API والمصادقة](#4-عميل-الـ-api-والمصادقة)
- [5. عارض النموذج الديناميكي](#5-عارض-النموذج-الديناميكي)
- [6. منضدة الاكتتاب](#6-منضدة-الاكتتاب)
- [7. نظام التصميم (Design Tokens)](#7-نظام-التصميم-design-tokens)
- [8. المكوّنات المشتركة](#8-المكوّنات-المشتركة)

## 1. البنية والتوجيه

التطبيق في [`apps/web`](../apps/web). التوجيه بنمط الأجزاء (segments) تحت `src/app/[locale]/`:

```
src/app/
  [locale]/
    layout.tsx          # جذر HTML: lang/dir حسب اللغة + الخطوط + NextIntlClientProvider
    page.tsx            # يحوّل إلى /tenant/dashboard
    not-found.tsx       # 404 ضمن اللغة
    login/page.tsx      # تسجيل الدخول (مكوّن عميل)
    tenant/
      layout.tsx        # قشرة لوحة المستأجر (Sidebar + Topbar)
      dashboard/ clients/ requests/ requests/new/ slips/[id]/
      commissions/ settings/staff/ add-ons/ policies/ renewals/
  globals.css           # design tokens (CSS variables) + Tailwind layers
```

- **`[locale]`** = `ar` (افتراضي، RTL) أو `en` (LTR). يُفرض البادئة دائماً (`/ar/...`, `/en/...`).
- `middleware.ts` (next-intl) يتولّى توجيه اللغة واكتشافها من ترويسة المتصفّح.
- التفاصيل في [12 — التعدّد اللغوي و RTL](./12-i18n-and-rtl.md).

## 2. قشرة المستأجر (Shell)

`[locale]/tenant/layout.tsx` يغلّف كل صفحات لوحة المستأجر بـ:
- **`Sidebar`** ([`components/layout/Sidebar.tsx`](../apps/web/src/components/layout/Sidebar.tsx)): العلامة، مجموعتا تنقّل (مساحة العمل + الإعدادات) من `TENANT_NAV` في `@ibp/shared`، تمييز العنصر النشط، شارات «قريباً» للموديولز غير المفعّلة، وتذييل «وضع تجريبي». على الحافة الداخلية (`border-e`) لدعم RTL.
- **`Topbar`** ([`components/layout/Topbar.tsx`](../apps/web/src/components/layout/Topbar.tsx)): بحث، مبدّل اللغة، جرس إشعارات، بطاقة المستخدم.

ترتيب عناصر التنقّل وحالات «قريباً» مطابقة للتصميم المرجعي في [`design-references/`](../design-references).

## 3. الصفحات

| المسار | الملف | الوصف | البيانات |
|---|---|---|---|
| `/[locale]/login` | `login/page.tsx` | تسجيل الدخول → يخزّن التوكن → يحوّل | API حقيقي |
| `/[locale]/tenant/dashboard` | `dashboard/page.tsx` | لوحة مؤشرات (KPIs + مهام + تجديدات) | بيانات وهمية (`lib/mock.ts`) |
| `/[locale]/tenant/clients` | `clients/page.tsx` | سجل العملاء + إنشاء + اعتماد التزام | API حقيقي |
| `/[locale]/tenant/requests` | `requests/page.tsx` | قائمة الطلبات + زر «إعداد عروض» (RFQ) | API حقيقي |
| `/[locale]/tenant/requests/new` | `requests/new/page.tsx` | طلب جديد بالنموذج الديناميكي | API حقيقي |
| `/[locale]/tenant/slips/[id]` | `slips/[id]/page.tsx` | منضدة الاكتتاب (مقارنة + عروض + إسناد) | API حقيقي |
| `/[locale]/tenant/settings/staff` | `settings/staff/page.tsx` | إدارة الموظفين بمصفوفة الصلاحيات | API حقيقي |
| `/[locale]/tenant/commissions` | `commissions/page.tsx` | لوحة العمولات | بيانات وهمية |
| add-ons / policies / renewals | `*/page.tsx` | سقالات «قيد الإنشاء» | — |

> الصفحات الموصولة بالـ API هي **مكوّنات عميل** (`"use client"`) تتحقّق من التوكن وتُعيد التوجيه إلى `/login` عند غيابه. صفحات لوحة التحكم/العمولات لا تزال ببيانات وهمية (تُربط لاحقاً).

## 4. عميل الـ API والمصادقة

[`lib/api.ts`](../apps/web/src/lib/api.ts):
- `getToken()/setToken()/clearToken()`: التوكن في `localStorage` (مفتاح `ibp_token`).
- `api<T>(path, opts)`: غلاف `fetch` يرفق `Authorization: Bearer` تلقائياً، الأساس من `NEXT_PUBLIC_API_URL`.
- `ApiError(status, message, details?)`: يحمل `details` (مصفوفة أخطاء التحقّق من 422) لعرضها في النماذج.

تدفّق الدخول: صفحة `login` → `POST /auth/login` → `setToken` → تحويل إلى لوحة المستأجر.

## 5. عارض النموذج الديناميكي

[`components/forms/DynamicForm.tsx`](../apps/web/src/components/forms/DynamicForm.tsx) يستقبل مخطّط الفرع (`sections` + `blocks`) ويُولّد النموذج آلياً:
- يعرض كل قسم بحقوله حسب نوعها (text/number/date/select/...).
- الكتل المتكررة (تابعون/مركبات/أرواح...) بأزرار إضافة/حذف صفوف (يحترم `min`).
- اللغة تحدّد التسميات (`labelAr`/`labelEn`). يبني الحمولة `{ base, blocks }` ويسلّمها لـ `onSubmit`.
- أخطاء التحقّق (422) تُعرض كقائمة.

التفصيل الكامل للمحرّك في [09 — محرّك النموذج الديناميكي](./09-dynamic-form-engine.md).

## 6. منضدة الاكتتاب

`slips/[id]/page.tsx`: تجلب `GET /slips/:id` + `GET /slips/:id/comparison`، وتعرض:
- رأس الـ Slip (رقم RFQ، الحالة، الشركات المُرسَل إليها).
- **جدول المقارنة الآلي** (شركة × النسبة/القسط/الضريبة/الإجمالي/التحمّل/الحد) مع تمييز الأرخص.
- نموذج «إضافة عرض» هجين (حقول معيارية + `generalRemarks` نص حر).
- زر **Firm Order** لكل عرض. التفصيل في [10 — الاكتتاب الفني](./10-underwriting-rfq.md).

## 7. نظام التصميم (Design Tokens)

المرجع البصري المعتمد: [`design-references/`](../design-references) (IBP-1/2/3.png). الرموز موثّقة في [`DESIGN.md`](../DESIGN.md) ومطبّقة عبر:
- [`globals.css`](../apps/web/src/app/globals.css): متغيّرات CSS (`--primary` teal #0d9488، `--bg`, `--surface`, `--text`, حالات success/warning/danger/info...).
- [`tailwind.config.ts`](../apps/web/tailwind.config.ts): ألوان Tailwind مربوطة بالمتغيّرات (`bg-primary`, `text-muted`, `bg-success-soft`...).

| الفئة | القيمة | الاستخدام |
|---|---|---|
| اللون الأساسي | `#0d9488` (teal-600) | العلامة، الأزرار، العناصر النشطة |
| الخلفية | `#f4f7f8` | خلفية التطبيق |
| السطح | `#ffffff` | البطاقات والجداول |
| نجاح/تحذير/خطر/معلومة | emerald/amber/red/blue (soft + نص) | شارات الحالة |
| الزوايا | بطاقات 14px، أزرار 8–10px، شارات/بحث كامل | — |
| الخطوط | IBM Plex Sans Arabic + Inter | — |

**قاعدة ملزمة (GUIDELINES.md):** عند بناء أي واجهة، تُفتح صور `design-references/` وتُطابَق الألوان والتخطيط والأقسام؛ لا قيم لون صلبة خارج الـ tokens.

## 8. المكوّنات المشتركة

| المكوّن | الغرض |
|---|---|
| `ui/Badge` | شارة حالة بألوان soft (success/warning/danger/info/neutral) |
| `ui/StatCard` | بطاقة مؤشّر (عنوان + قيمة + رقاقة أيقونة ملوّنة) |
| `ui/PageHeader` | عنوان الصفحة + وصف + أزرار إجراء |
| `ui/Placeholder` | سقالة «قيد الإنشاء» |
| `layout/LocaleSwitcher` | مبدّل اللغة (يبدّل المسار باللغة الأخرى) |
| `forms/DynamicForm` | عارض النموذج الديناميكي |

## انظر أيضاً
- [12 — التعدّد اللغوي و RTL](./12-i18n-and-rtl.md)
- [09 — محرّك النموذج الديناميكي](./09-dynamic-form-engine.md) · [10 — الاكتتاب الفني](./10-underwriting-rfq.md)
- [06 — مرجع الـ API](./06-api-reference.md) — النقاط التي تستهلكها الواجهة
- [`DESIGN.md`](../DESIGN.md) · [`design-references/`](../design-references)
