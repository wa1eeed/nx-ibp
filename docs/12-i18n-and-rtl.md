# 12 — التعدّد اللغوي و RTL (Internationalization & RTL)

> IBP ثنائي اللغة (عربي/إنجليزي) ويدعم RTL/LTR من الأساس، باستخدام **next-intl**. العربية هي اللغة الافتراضية (RTL) لأن السوق سعودي. هذا الملف يوثّق التوجيه باللغة، ملفات الرسائل، اتجاه الصفحة، مبدّل اللغة، والخطوط.

## جدول المحتويات
- [1. الإعداد](#1-الإعداد)
- [2. التوجيه باللغة](#2-التوجيه-باللغة)
- [3. اتجاه الصفحة (RTL/LTR)](#3-اتجاه-الصفحة-rtlltr)
- [4. ملفات الرسائل](#4-ملفات-الرسائل)
- [5. مبدّل اللغة](#5-مبدّل-اللغة)
- [6. الخطوط](#6-الخطوط)

## 1. الإعداد

- المكتبة: `next-intl` (متكاملة مع App Router).
- البنية:
  - [`src/i18n/routing.ts`](../apps/web/src/i18n/routing.ts): `defineRouting({ locales: ['ar','en'], defaultLocale: 'ar', localePrefix: 'always' })` + `createNavigation` (يصدّر `Link`, `redirect`, `usePathname`, `useRouter`).
  - [`src/i18n/request.ts`](../apps/web/src/i18n/request.ts): `getRequestConfig` يحمّل رسائل اللغة الحالية.
  - [`src/middleware.ts`](../apps/web/src/middleware.ts): `createMiddleware(routing)` — توجيه اللغة على كل المسارات عدا الـ API والملفات الثابتة.
  - [`next.config.mjs`](../apps/web/next.config.mjs): `createNextIntlPlugin('./src/i18n/request.ts')`.

## 2. التوجيه باللغة

كل المسارات مسبوقة باللغة: `/ar/tenant/dashboard`، `/en/tenant/clients`. الجذر `/` يحوّل إلى `/ar` (أو `/en` حسب اكتشاف ترويسة المتصفّح `Accept-Language`). استخدم `Link` و`useRouter` من `@/i18n/routing` (لا من `next/link` مباشرةً) للحفاظ على بادئة اللغة.

## 3. اتجاه الصفحة (RTL/LTR)

`[locale]/layout.tsx` يضبط `<html lang dir>` حسب اللغة عبر `dirForLocale(locale)` من `@ibp/shared` (`ar` ⟵ `rtl`، `en` ⟵ `ltr`).

**قواعد التخطيط:** تُستخدم **الخصائص المنطقية** لا اليمين/اليسار الصريحة:
- هوامش/حشوات: `ps-*`/`pe-*`, `ms-*`/`me-*`, `start-*`/`end-*`.
- حدود: `border-e`/`border-s`.
- الأيقونات الاتجاهية تُقلب بـ `rtl:rotate-180`.

هكذا تنعكس الواجهة كاملةً (الشريط الجانبي يمين في العربية، يسار في الإنجليزية) دون كود مكرّر.

## 4. ملفات الرسائل

[`apps/web/messages/ar.json`](../apps/web/messages/ar.json) و[`en.json`](../apps/web/messages/en.json). منظّمة بمساحات أسماء (namespaces):

| Namespace | المحتوى |
|---|---|
| `brand`, `common`, `navGroup`, `nav` | العلامة والتنقّل |
| `topbar`, `demo`, `dashboard` | الشريط العلوي ولوحة التحكم |
| `clients`, `requests`, `requestForm` | العملاء والطلبات والنموذج |
| `underwriting` | الاكتتاب وجدول المقارنة |
| `staff`, `modules`, `login` | الموظفون ومصفوفة الصلاحيات والدخول |
| `status`, `placeholder` | الحالات والسقالات |

الاستخدام في المكوّنات: `useTranslations()` ثم `t('clients.title')`. المفاتيح المتداخلة تُقرأ بنقاط (`t('nav.settings.staff')`).

## 5. مبدّل اللغة

[`components/layout/LocaleSwitcher.tsx`](../apps/web/src/components/layout/LocaleSwitcher.tsx): زر يعرض اللغة الأخرى (AR/EN) ويبدّل المسار الحالي إليها عبر `router.replace(pathname, { locale })` مع الحفاظ على الصفحة.

## 6. الخطوط

- لاتيني: **Inter** · عربي: **IBM Plex Sans Arabic** (تُحمّل عبر Google Fonts في رأس `[locale]/layout.tsx`، مع تدرّج احتياطي للنظام لضمان نجاح البناء دون اتصال).
- المكدّس في `globals.css`: `--font-sans`.

## انظر أيضاً
- [11 — الواجهة ونظام التصميم](./11-frontend-and-design-system.md)
- [`packages/shared/src/constants.ts`](../packages/shared/src/constants.ts) — `LOCALES`, `DEFAULT_LOCALE`, `dirForLocale`
