-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "trialDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "unifiedNumber" TEXT,
ADD COLUMN     "vatNumber" TEXT;

