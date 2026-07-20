-- رخصة المقاعد (نموذج مسبق الدفع): حدّ أقصى للمستخدمين النشطين = المقاعد المرخّصة.
-- إضافة مستخدم يتجاوزها ممنوعة حتى تُرفَع الرخصة (شراء مقاعد يزيد seatsLicensed عند الدفع).

-- المقاعد المرخّصة على الاشتراك (المخصّصة عند التسجيل + المشتراة لاحقًا).
ALTER TABLE "Subscription" ADD COLUMN "seatsLicensed" INTEGER NOT NULL DEFAULT 1;

-- فاتورة شراء مقاعد: عدد المقاعد المضافة للرخصة عند الدفع (null = فاتورة اشتراك عادية).
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "seatsDelta" INTEGER;

-- تعبئة رجعية: الرخصة ≥ عدد المستخدمين النشطين الحاليين حتى لا يُحبَس أي مستأجر قائم.
UPDATE "Subscription" s
SET "seatsLicensed" = GREATEST(
  s."seatsUsed",
  (SELECT COUNT(*) FROM "User" u WHERE u."tenantId" = s."tenantId" AND u."status" = 'ACTIVE')
);
