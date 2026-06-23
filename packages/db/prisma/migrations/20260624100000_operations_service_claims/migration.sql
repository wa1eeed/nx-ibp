-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'SENT_TO_INSURER', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('RECEIVED', 'UNDER_REVIEW', 'SUBMITTED', 'SETTLED', 'CLOSED', 'REJECTED');

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "claimedAmount" DECIMAL(14,2),
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deductible" DECIMAL(14,2),
ADD COLUMN     "details" JSONB,
ADD COLUMN     "incidentDate" TIMESTAMP(3),
ADD COLUMN     "insurerName" TEXT,
ADD COLUMN     "policyId" TEXT,
ADD COLUMN     "settledAmount" DECIMAL(14,2),
ADD COLUMN     "status" "ClaimStatus" NOT NULL DEFAULT 'RECEIVED';

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "details" JSONB,
ADD COLUMN     "policyId" TEXT,
ADD COLUMN     "status" "ServiceStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "type" TEXT NOT NULL;

