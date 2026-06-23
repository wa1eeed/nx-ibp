-- CreateEnum
CREATE TYPE "SlipStatus" AS ENUM ('DRAFT', 'SENT', 'QUOTED', 'SELECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('RECEIVED', 'SELECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('JRV', 'PYV', 'RCV', 'DPV');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RequestStatus" ADD VALUE 'QUOTING';
ALTER TYPE "RequestStatus" ADD VALUE 'AWARDED';

-- AlterTable
ALTER TABLE "ChartOfAccount" ADD COLUMN     "accountType" TEXT,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "costCenterId" TEXT,
ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isOnBalance" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "insurerName" TEXT,
ADD COLUMN     "netAmount" DECIMAL(14,2),
ADD COLUMN     "policyId" TEXT,
ADD COLUMN     "qrPayload" TEXT,
ADD COLUMN     "status" TEXT DEFAULT 'draft',
ADD COLUMN     "totalAmount" DECIMAL(14,2),
ADD COLUMN     "vatAmount" DECIMAL(14,2),
ADD COLUMN     "zatcaHash" TEXT;

-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN     "amount" DECIMAL(16,2),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isAuto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lines" JSONB,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "status" TEXT DEFAULT 'draft',
DROP COLUMN "type",
ADD COLUMN     "type" "VoucherType" NOT NULL;

-- CreateTable
CREATE TABLE "Slip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "sequenceNo" TEXT,
    "status" "SlipStatus" NOT NULL DEFAULT 'DRAFT',
    "insurers" TEXT[],
    "notes" TEXT,
    "selectedQuotationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Slip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slipId" TEXT NOT NULL,
    "insurerName" TEXT NOT NULL,
    "rate" DECIMAL(6,3),
    "premium" DECIMAL(14,2),
    "vat" DECIMAL(14,2),
    "totalPremium" DECIMAL(14,2),
    "deductible" DECIMAL(14,2),
    "limit" DECIMAL(16,2),
    "validUntil" TIMESTAMP(3),
    "coverFields" JSONB,
    "generalRemarks" TEXT,
    "additionalConditions" TEXT,
    "status" "QuotationStatus" NOT NULL DEFAULT 'RECEIVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Endorsement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "sequenceNo" TEXT,
    "type" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "premiumDelta" DECIMAL(14,2),
    "details" JSONB,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Endorsement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "parentId" TEXT,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebitNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sequenceNo" TEXT,
    "clientId" TEXT,
    "policyId" TEXT,
    "netAmount" DECIMAL(14,2),
    "vatAmount" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sequenceNo" TEXT,
    "clientId" TEXT,
    "policyId" TEXT,
    "netAmount" DECIMAL(14,2),
    "vatAmount" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Slip_tenantId_idx" ON "Slip"("tenantId");

-- CreateIndex
CREATE INDEX "Slip_requestId_idx" ON "Slip"("requestId");

-- CreateIndex
CREATE INDEX "Quotation_tenantId_idx" ON "Quotation"("tenantId");

-- CreateIndex
CREATE INDEX "Quotation_slipId_idx" ON "Quotation"("slipId");

-- CreateIndex
CREATE INDEX "Endorsement_tenantId_idx" ON "Endorsement"("tenantId");

-- CreateIndex
CREATE INDEX "Endorsement_policyId_idx" ON "Endorsement"("policyId");

-- CreateIndex
CREATE INDEX "CostCenter_tenantId_idx" ON "CostCenter"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_tenantId_code_key" ON "CostCenter"("tenantId", "code");

-- CreateIndex
CREATE INDEX "DebitNote_tenantId_idx" ON "DebitNote"("tenantId");

-- CreateIndex
CREATE INDEX "CreditNote_tenantId_idx" ON "CreditNote"("tenantId");

-- CreateIndex
CREATE INDEX "ChartOfAccount_parentId_idx" ON "ChartOfAccount"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_tenantId_code_key" ON "ChartOfAccount"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "Slip" ADD CONSTRAINT "Slip_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slip" ADD CONSTRAINT "Slip_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PolicyRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_slipId_fkey" FOREIGN KEY ("slipId") REFERENCES "Slip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

