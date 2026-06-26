# 00 — حالة المشروع ونقطة الاستئناف (Project Status & Resume)

> **نقطة الدخول للاستئناف لاحقاً.** تلخّص أين وصلنا، وكيف نشغّل المنصّة، وما المتبقّي. حُدِّثت: 2026-06-26.

## 1. الحالة العامة
- **المنصّة مكتملة وظيفياً**: المراحل 0–9 + جاهزية **ZATCA Fatoora المرحلة 2** — كلها مُنفَّذة ومُختبَرة.
- **الاختبارات**: **e2e 103/103** (13 ملفاً) على قاعدة اختبار منفصلة `ibp_test`.
- **الفرع الموثوق**: `phase-4b-zatca-p2` (يحوي كل التاريخ — 22 commit). **لا يوجد فرع `main` بعد** (يُنصح بإنشائه من هذا الرأس).
- **التموضع**: InsurTech SaaS · «نظام تشغيل وساطة التأمين» — مع لاندينق بيج تسويقي على جذر الدومين.

## 2. ما أُنجز (المراحل)
| المرحلة | المحتوى | التحقّق |
|---|---|---|
| 0–3 | الأساس + المصادقة/العزل + RBAC/Entitlements + العملاء/الكتالوج/النموذج الديناميكي | ✅ |
| 4أ | الاكتتاب وعروض الأسعار (RFQ + مقارنة + Firm Order) | ✅ |
| 4ب | الإصدار والنواة المالية (قيد JRV مزدوج، COA 17 رقماً، فاتورة) | ✅ |
| 5 | وحدة المستندات (روابط موقّتة، عزل بالمسار) | ✅ |
| 6 | خدمة العملاء + المطالبات + التجديدات | ✅ |
| 7 | التحقّق الحكومي KYC/KYB (يقين/واثق/نفاذ/العنوان/PEP) | ✅ |
| 8أ/8ب/8ج | لوحة السوبر أدمن · بوّابة العميل · التقارير الحيّة | ✅ |
| 9 | التكاملات التنظيمية (Sandbox) + النشر داخل المملكة (k8s/terraform) | ✅ |
| **4ب+** | **ZATCA المرحلة 2**: تهيئة معزولة، CSR/CSID، عدّاد وتجزئة معزولة، توجيه B2B/B2C | ✅ e2e 103/103 |

تفاصيل دورة العمل في [08](./08-deal-lifecycle-workflows.md)، وZATCA المرحلة 2 في [28](./28-zatca-phase2-fatoora.md).

## 3. الواجهات الأربع + حسابات العرض (كلمة المرور: `Passw0rd!`)
| الواجهة | المسار | حسابات |
|---|---|---|
| اللاندينق | `/` | عامّة (تسويقية) |
| الموظف/المستأجر | `/login` | `waleed@gulf-demo.sa` (مدير عام) · sara/fahad/laila/huda/majed/nora@gulf-demo.sa · omar@aman-demo.sa |
| السوبر أدمن | `/admin/login` | `admin@ibp-platform.sa` |
| بوّابة العميل | `/portal/login` | `portal@alfahd.sa` · `portal@naseej.sa` · `portal@redsea-dev.sa` · `portal@nukhba.sa` |

## 4. التشغيل السريع (Resume)
```bash
# 1) البنية التحتية (Docker Desktop)
open -a Docker && docker start ibp-postgres ibp-redis

# 2) (مرّة) القاعدة + البذرة — dev و test
pnpm --filter @ibp/db migrate:deploy && pnpm --filter @ibp/db seed
pnpm --filter @ibp/db test:setup          # قاعدة الاختبار ibp_test

# 3) التشغيل
pnpm --filter @ibp/api dev                 # http://localhost:4000
pnpm --filter @ibp/web dev                 # http://localhost:3000

# 4) الاختبارات
pnpm --filter @ibp/api test:e2e            # 103/103
```
البيانات شبه واقعية: 21 عميلاً · 25 وثيقة · مطالبات/طلبات/عروض/فواتير/عمولات.

## 5. ما المتبقّي (خطوات اختيارية لاحقة)
1. **ZATCA إنتاجي**: استبدال `ZatcaGateway` (Sandbox) بنداءات الهيئة الحقيقية + توليد PDF/A-3 بالختم — نقطة تبديل واحدة.
2. **طابور الإبلاغ B2C**: ترقية المُصرِّف الخفيف إلى **BullMQ worker/cron** فعلي (Redis متوفّر).
3. **سلاسل اعتماد قابلة للتهيئة** (متعددة الخطوات) + **تنبيهات** عند انتقالات الحالة.
4. **Git**: إنشاء `main` من `phase-4b-zatca-p2` ودمج/تنظيف فروع المراحل + رفع للريموت (لم يُرفع بعد).
5. تجسيد وحدات Terraform لمزوّد سحابي محدّد داخل المملكة (المرحلة 9 الإنتاجية).

## 6. خريطة التوثيق
- المعمار والأمان: [02](./02-architecture.md) · [04](./04-security-and-multitenancy.md) (العزل ثلاثي الطبقات + نطاقات المنصّة/العميل)
- البيانات: [03](./03-data-model.md) · API: [06](./06-api-reference.md) · الوحدات: [07](./07-backend-modules.md)
- دورة الصفقة: [08](./08-deal-lifecycle-workflows.md) · المالية: [20](./20-issuance-and-finance-core.md) · ZATCA P2: [28](./28-zatca-phase2-fatoora.md)
- التشغيل واستكشاف الأخطاء: [13](./13-local-setup-and-operations.md) · الاختبارات: [16](./16-testing.md) · المراحل والفروع: [18](./18-git-workflow-and-roadmap.md)
- الفهرس الكامل: [README](./README.md) · سجل التغييرات: [CHANGELOG](../CHANGELOG.md)

## 7. ملاحظات تشغيلية مهمّة
- **لا تشغّل `pnpm build` (إنتاج) وخادم التطوير على نفس `.next`** — يسبب `Cannot find module './vendor-chunks/...'`. الحل: `rm -rf apps/web/.next` وأعد التشغيل ([13 §7](./13-local-setup-and-operations.md)).
- Docker Desktop قد يتوقّف بين الجلسات — أعد تشغيله قبل أي عمل بالقاعدة.
- الاختبارات تستخدم `ibp_test` (عبر `.env.test`) ولا تلوّث `ibp_dev`.
