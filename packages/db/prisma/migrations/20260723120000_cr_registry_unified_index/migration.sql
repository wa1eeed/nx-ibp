-- فهرس الرقم الموحّد (700…) — لتسريع البحث به بجانب رقم السجل على ملايين الصفوف.
CREATE INDEX IF NOT EXISTS "CrRegistryRecord_unifiedNumber_idx" ON "CrRegistryRecord"("unifiedNumber");
