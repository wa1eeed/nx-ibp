-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('TECHNICAL_REVIEW', 'FINANCE_REVIEW', 'ISSUED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "commissionAmount" DECIMAL(14,2),
ADD COLUMN     "commissionRate" DECIMAL(6,3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "insurerName" TEXT,
ADD COLUMN     "premium" DECIMAL(14,2),
ADD COLUMN     "productLineCode" TEXT,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "status" "PolicyStatus" NOT NULL DEFAULT 'TECHNICAL_REVIEW',
ADD COLUMN     "totalPremium" DECIMAL(14,2),
ADD COLUMN     "vat" DECIMAL(14,2);

-- CreateIndex
CREATE INDEX "Policy_requestId_idx" ON "Policy"("requestId");

