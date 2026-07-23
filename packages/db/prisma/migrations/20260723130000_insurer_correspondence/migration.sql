-- تتبّع إرسال مراسلات شركات التأمين من الخدمة والمطالبات.
ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "sentToInsurerAt" TIMESTAMP(3);
ALTER TABLE "Claim" ADD COLUMN IF NOT EXISTS "sentToInsurerAt" TIMESTAMP(3);
