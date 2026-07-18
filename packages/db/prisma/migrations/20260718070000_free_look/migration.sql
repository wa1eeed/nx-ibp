-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "freeLookUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TenantConfig" ADD COLUMN     "operationsPolicy" JSONB;

