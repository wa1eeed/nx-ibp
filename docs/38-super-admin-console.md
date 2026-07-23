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

## انظر أيضاً
[00 — الحالة](./00-project-status.md) · [06 — API](./06-api-reference.md) · [30 — الأمن](./30-security-and-compliance.md) · [34 — ما بعد الاكتمال](./34-post-completion-features.md) · [CHANGELOG](../CHANGELOG.md)
