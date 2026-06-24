-- AlterTable
ALTER TABLE "Commission" ADD COLUMN     "clientName" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "insurerName" TEXT,
ADD COLUMN     "periodMonth" TEXT,
ADD COLUMN     "policyId" TEXT,
ADD COLUMN     "productLine" TEXT,
ADD COLUMN     "rate" DECIMAL(6,3),
ADD COLUMN     "receivedAmount" DECIMAL(12,2),
ADD COLUMN     "status" TEXT DEFAULT 'accrued';

