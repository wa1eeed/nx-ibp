# الصفحة التسويقية (Landing) — أنيميشن مصمَّم بالكود

الصفحة العامّة [`[locale]/page.tsx`](../apps/web/src/app/[locale]/page.tsx) + صفحة المميزات المستقلّة [`[locale]/features/page.tsx`](../apps/web/src/app/[locale]/features/page.tsx). كل الرسوم المتحرّكة **مصمَّمة بالكود** (CSS keyframes في [`globals.css`](../apps/web/src/app/globals.css)) بلا صور أو مكتبات خارجية — تحترم RTL/LTR و`prefers-reduced-motion`.

## المكوّنات
- **القائمة الرئيسية** (الرأس): المميزات (`#features`) · وكلاء الذكاء (`#ai`) · الباقات (`#pricing`) · التملّك (`/ownership`).
- **أنيميشن سير المعاملة** [`WorkflowAnimation`](../apps/web/src/components/landing/WorkflowAnimation.tsx): إشارة تنتقل عبر خمس مراحل (طلب ⇐ اكتتاب ⇐ تسعير ⇐ إصدار ⇐ تحقّق) بتوهّج متتابع (`wf-flow`/`wf-ring`)، مسار متحرّك (`wf-track`)، وعلامة تحقّق ZATCA مرسومة (`wf-check`). الترتيب ينعكس تلقائيًا مع RTL.
- **وكلاء الذكاء الاصطناعي** [`AiAgentsSection`](../apps/web/src/components/landing/AiAgentsSection.tsx): قسم داكن بستّة وكلاء (CRM · تسعير · مطالبات · مالية · امتثال · موارد بشرية) — كل موديول سيُعزَّز بوكيل («قريبًا»)، بهالة وومضة مصمَّمة بالكود.
- **المميزات**: شبكة تغطّي كل الموديولات + «تصفّح جميع المميزات» ⇐ `/features`.
- **صفحة `/features`**: ١٢ ميزة، لكلٍّ رسم متحرّك عبر [`FeatureViz`](../apps/web/src/components/landing/FeatureViz.tsx) بستّة أنماط: `cards` (كانبان) · `flow` (مسار) · `bars` (أعمدة) · `count` (عدّاد) · `scan` (مسح وثيقة) · `calendar` (تقويم).

> **قرار تصميمي**: أُبقِيت الأنيميشن على CSS خالص (بلا JS/مكتبات) لضمان الأداء، توافق SSR/بناء الإنتاج، واحترام تفضيل تقليل الحركة.

## انظر أيضاً
[00 — الحالة](./00-project-status.md) · [31 — كتالوج المزايا](./31-feature-catalog.md) · [39 — الموارد البشرية](./39-hr-module.md) · [CHANGELOG](../CHANGELOG.md)
