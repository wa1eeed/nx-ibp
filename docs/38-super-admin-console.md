# لوحة تحكّم المنصّة (السوبر أدمن) — تحكّم ٣٦٠°

مشرف المنصّة (NX) يدير كل شركات الوساطة من لوحة `/admin` (نطاق منصّة عابر للعزل، محروس بـ`PlatformGuard`). هذا الملف يوثّق قدرات التحكّم الكامل التي تتجاوز العرض للـ**فعل** (دعم · فوترة · دورة حياة الاشتراك).

## 1. الدخول كالحساب (انتحال آمن)

يتيح للمشرف الدخول لأي حساب شركة **بصلاحية مالكه** للدعم والتشخيص، مع عودة فورية — دون معرفة كلمة المرور.

- **المسار**: `POST /platform/tenants/:id/impersonate` (محروس `PlatformGuard`) — [`PlatformService.impersonate`](../apps/api/src/modules/platform/platform.service.ts).
  - يختار **مالك الحساب** (أوّل مستخدم نشِط) ويُصدر توكن مستأجر عاديًا موسومًا بـ`imp=adminId` وبصلاحية **60 دقيقة** فقط.
  - **يُسجَّل في التدقيق** دائمًا: `entity=tenant_impersonate, action=login, meta.actingAs=<بريد المالك>`.
- **تدفّق الوسم**: [`TenantContextMiddleware`](../apps/api/src/common/middleware/tenant-context.middleware.ts) يقرأ `imp` ⇒ `req.user.impersonatorId`؛ و`GET /auth/me` يعيد `impersonation { tenantId, tenantName, adminEmail }` (جلسة عادية ⇒ `null`).
- **الواجهة**:
  - زر «الدخول كالحساب» في `/admin/tenants/[id]` ⇒ يحفظ التوكن كـ`ibp_token` (مفتاح منفصل عن `ibp_platform_token`) وينتقل إلى `/tenant/dashboard`.
  - [`ImpersonationBanner`](../apps/web/src/components/layout/ImpersonationBanner.tsx): شريط **بنفسجي دائم** أعلى لوحة المستأجر — يعرض اسم الحساب + «العودة للوحة المنصّة». العودة = حذف `ibp_token` فقط (رمز المنصّة باقٍ) والرجوع لصفحة المستأجر في اللوحة.
- **الأمان**: محروس للسوبر أدمن فقط · صلاحية قصيرة · بانر ظاهر لا يُخفى · كل بدء انتحال مُدقَّق. الكتابة أثناء الانتحال تخضع لنفس حواجز الوصول (تعليق/انتهاء) للحساب المُنتحَل.

## 2. إدارة دورة حياة الاشتراك (باقة · تجديد · حالة)

يتحكّم المشرف في اشتراك أي حساب مباشرةً من `/admin/tenants/[id]` — دون الرجوع لقاعدة البيانات:

- **تغيير الباقة**: `PUT /platform/tenants/:id/plan` (`{planCode, cycle?}`) — [`changeTenantPlan`](../apps/api/src/modules/platform/platform.service.ts). يبدّل `subscription.planId` ويُبطل كاش الوصول ⇒ **الميزات تسري فورًا** (ترقية `basic⇒premium` تفتح ZATCA لحظيًّا). مُدقَّق (`tenant_plan`, from→to). الواجهة: قائمة منسدلة بالباقات.
- **ضبط/تمديد التجديد**: `POST /platform/tenants/:id/renewal` (`{renewsAt?}` تاريخ صريح أو `{months}` تمديد) — [`setRenewal`](../apps/api/src/modules/platform/platform.service.ts). التمديد بالأشهر يبدأ من الأبعد بين (الآن، التجديد الحالي)، يضبط `ACTIVE`، ويُبطل الكاش ⇒ **يرفع أي حجب انتهاء فورًا** (منح فترة سماح/تمديد يدوي). مُدقَّق (`tenant_renewal`). الواجهة: زرّا «+شهر»/«+سنة».
- **التحكّم في الحالة**: `POST /platform/tenants/:id/status` — قائمة منسدلة `ACTIVE/TRIAL/SUSPENDED/CANCELLED` في التفاصيل + زر تعليق/تفعيل في القائمة. يُبطل الكاش ⇒ فرض/رفع فوري.
- **رؤية الانتهاء**: كل من `GET /platform/tenants` و`/platform/tenants/:id` يعيدان `access {state, endsAt, daysLeft}` — يُظهران **تاريخ انتهاء التجربة/الاشتراك دائمًا** (لا نافذة الـ7 أيام فقط، عبر [`accessView`](../apps/api/src/modules/platform/platform.service.ts)). القائمة تعرض عمود «انتهاء الاشتراك» بشارة ملوّنة؛ `renewsAt=null` ⇒ «بلا تاريخ انتهاء».
- **المقاعد**: التفاصيل تعرض `المستخدمون النشطون / المرخّصة` (مثل `7 / 200`).

## 3. لوحة القيادة (360°)

نظرة صحّة شاملة على `/admin/usage` — `GET /platform/overview` ([`overview`](../apps/api/src/modules/platform/platform.service.ts)):
- **الإيراد الشهري المتكرّر (MRR)**: تقدير من الاشتراكات المدفوعة النشطة (شهري = السعر×المقاعد المرخّصة؛ سنوي = السنوي/12×المقاعد).
- **توزيع الحالات**: عدّاد `ACTIVE/TRIAL/SUSPENDED/CANCELLED` + طلبات التواصل الجديدة.
- **اشتراكات وشيكة على الانتهاء (≤30 يومًا)**: قائمة مرتّبة تصاعديًا (تجربة/اشتراك) بشارات أيام ملوّنة (أحمر للمنتهي، كهرماني ≤7 أيام) — كلٌّ يربط لتفاصيل الحساب لاتخاذ إجراء.
- **أحدث التسجيلات**: آخر ٦ حسابات بمالكها وحالتها.
- **عدّادات الاستخدام**: مستخدمون · عملاء · وثائق · طلبات · مطالبات · تحقّق (عبر كل المستأجرين).

> **قرار تصميمي (أقلّ امتياز):** لا نضيف «إعادة تعيين كلمة مرور المالك» — **الانتحال** (القسم 1) يغطّي حاجة الدعم دون كشف/تغيير كلمات المرور.

## 3-أ. سجلّ السجلات التجارية المرجعي (تنزيل قالب + استيراد بيانات)

من `/admin/cr-registry` ([`AdminCrRegistryPage`](../apps/web/src/app/[locale]/admin/cr-registry/page.tsx)) يدير السوبر أدمن بيانات الشركات التي تُغذّي التحقّق والتعبئة الذكية — **دون نشر جديد**:
- **العرض**: `GET /platform/cr-registry/meta` ⇒ عدد السجلات + آخر مصدر/لقطة.
- **القالب**: زرّ يبني **CSV** (بترميز عربي — BOM) بأعمدة الداتاست القياسية + صفّ مثال (يُنشأ في المتصفّح، لا endpoint).
- **الاستيراد**: رفع CSV يُحلَّل **في المتصفّح** ثم يُرسَل على **دُفعات (٢٠٠٠ صفّ/طلب، مع شريط تقدّم)** إلى `POST /platform/cr-registry/import` — [`importCrRegistry`](../apps/api/src/modules/platform/platform.service.ts) يستدعي `CrRegistryService.importRows` (**upsert برقم السجل**، ≤٥٠٠٠ صفّ/طلب، وسم `manual_<الملفّ>`، تدقيق `cr_registry`). التفصيل الكامل في [docs/23 §4-أ](./23-government-verification.md).

## 4. إنهاء خدمة الموظف (المغادرة/الاستقالة) — على مستوى الشركة

*(هذه قدرة لأدمن الشركة لا للمنصّة، لكنها جزء من إدارة الرخص.)* من ملف الموظف `/tenant/settings/staff/[id]` — [`offboard`](../apps/api/src/modules/staff/staff.service.ts) عبر `POST /staff/:id/offboard` (`settings.delete`):
1. **نقل المهام المفتوحة** اختياريًا (`reassignToId`): صفقات · مهام · طلبات خدمة · شكاوى تُنقَل لموظف آخر نشِط (بلا فقدان مسؤولية؛ سجلّ التدقيق التاريخي **لا يتغيّر**).
2. **تعطيل الحساب** (`DISABLED`) — يُحرَّر مقعده فورًا (`seatsUsed` يُعاد حسابه).
3. **الرخصة**: افتراضيًا المقعد يبقى متاحًا **لموظف بديل بلا تكلفة** (نقل الرخصة)؛ أو `cancelSeat` لإلغائه (تقليل `seatsLicensed`، لا يقلّ عن المستخدَم فعليًا).
- حواجز: لا إنهاء خدمة الحساب لنفسه (400) · لا تكرار على حساب مُعطَّل. مُدقَّق (`user_offboard`).
- الواجهة: زر «إنهاء الخدمة» (يظهر للنشطين) ⇒ حوار باختيار المنقول إليه + خانة إلغاء الرخصة + ملخّص ما نُقِل.

## انظر أيضاً
[00 — الحالة](./00-project-status.md) · [06 — API](./06-api-reference.md) · [30 — الأمن](./30-security-and-compliance.md) · [34 — ما بعد الاكتمال](./34-post-completion-features.md) · [CHANGELOG](../CHANGELOG.md)
