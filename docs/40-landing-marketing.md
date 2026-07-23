# الصفحة التسويقية (Landing) — أنيميشن مصمَّم بالكود

الصفحة العامّة [`[locale]/page.tsx`](../apps/web/src/app/[locale]/page.tsx) + صفحة المميزات المستقلّة [`[locale]/features/page.tsx`](../apps/web/src/app/[locale]/features/page.tsx). كل الرسوم المتحرّكة **مصمَّمة بالكود** (CSS keyframes في [`globals.css`](../apps/web/src/app/globals.css)) بلا صور أو مكتبات خارجية — تحترم RTL/LTR و`prefers-reduced-motion`. الأسلوب مستوحى من صفحات الفنتك الحديثة (كشف عند التمرير + أرقام تتصاعد + تدفّق بيانات حيّ).

## المكوّنات
- **القائمة الرئيسية** (الرأس): المميزات (`#features`) · وكلاء الذكاء (`#ai`) · الباقات (`#pricing`) · التملّك (`/ownership`).
- **أنيميشن سير المعاملة** [`WorkflowAnimation`](../apps/web/src/components/landing/WorkflowAnimation.tsx): **حزمة بيانات متوهّجة** تسري على السكّة (`wf-packet` — منطقيّة الاتجاه بـ`inset-inline-start` فتحترم RTL) عبر خمس مراحل (طلب ⇐ اكتتاب ⇐ تسعير ⇐ إصدار ⇐ تحقّق) فتُضيء كل عُقدة عند مرورها (`wf-flow`/`wf-ring`)، مع سكّة متحرّكة (`wf-track`)، علامة تحقّق ZATCA مرسومة (`wf-check`)، خلفية «أورورا» تتنفّس (`hero-aurora`)، وشارة «معالجة فورية» (`fx-ticker`).
- **كشف عند التمرير** [`Reveal`](../apps/web/src/components/landing/Reveal.tsx): يظهر المحتوى بانزلاق/تلاشٍ لطيف عند دخوله منطقة العرض (`IntersectionObserver` + صنفا `.reveal`/`.reveal.in`)، بترتيب متتابع (`stagger`) عبر `delay`. يُطبَّق على البطل والمميزات والشرائح.
- **شريط الإحصاءات** [`StatsBand`](../apps/web/src/components/landing/StatsBand.tsx) + [`CountUp`](../apps/web/src/components/landing/CountUp.tsx): أرقام حقيقية للمنصّة تتصاعد من الصفر عند التمرير (easeOutCubic) — ٤٧ فرعًا ومنتَجًا · ٣٣ شاشة/موديولًا · ١٠٠٪ توافق ZATCA · ٤ أطر امتثال سعودية.
- **وكلاء الذكاء الاصطناعي** [`AiAgentsSection`](../apps/web/src/components/landing/AiAgentsSection.tsx): قسم داكن بستّة وكلاء (CRM · تسعير · مطالبات · مالية · امتثال · موارد بشرية) — كل موديول سيُعزَّز بوكيل («قريبًا»)، بهالة وومضة مصمَّمة بالكود.
- **المميزات**: شبكة تغطّي كل الموديولات ببطاقات مرقّمة (01…) وارتفاع عند المرور (`hover:-translate-y`)، + «تصفّح جميع المميزات» ⇐ `/features`.
- **صفحة `/features`**: ١٢ ميزة، لكلٍّ رسم متحرّك عبر [`FeatureViz`](../apps/web/src/components/landing/FeatureViz.tsx) بستّة أنماط (`cards`/`flow`/`bars`/`count`/`scan`/`calendar`) + لمعان دوريّ يعبر الصندوق (`fx-sweep`)، بطاقات مرقّمة وارتفاع عند المرور.

> **قرار تصميمي**: الأنيميشن الزخرفية على CSS خالص (أداء + توافق SSR/بناء الإنتاج). التفاعل مع التمرير (`Reveal`/`CountUp`) عبر `IntersectionObserver` خفيف (`"use client"`) يقفز مباشرةً للحالة النهائية مع `prefers-reduced-motion` أو غياب `IntersectionObserver`. قاعدة تقليل الحركة عامّة (`*` reset) فتغطّي حتى الأنيميشن المطبَّقة عبر `style` المضمّن.

## انظر أيضاً
[00 — الحالة](./00-project-status.md) · [31 — كتالوج المزايا](./31-feature-catalog.md) · [39 — الموارد البشرية](./39-hr-module.md) · [CHANGELOG](../CHANGELOG.md)
