-- إثراء سجل التدقيق (Audit Trail) بهوية الفاعل الكاملة ولقطات الحالة (NCA ECC / Database Compliance)
ALTER TABLE "AuditLog" ADD COLUMN "role" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "oldValues" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN "newValues" JSONB;
