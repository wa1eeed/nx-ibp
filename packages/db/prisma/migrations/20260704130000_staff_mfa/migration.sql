-- AlterTable
ALTER TABLE "TenantConfig" ADD COLUMN     "securityPolicy" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaSecret" TEXT;

