-- CreateTable
CREATE TABLE "CoverNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sequenceNo" TEXT,
    "requestId" TEXT NOT NULL,
    "clientId" TEXT,
    "quotationId" TEXT,
    "insurerName" TEXT,
    "productLineCode" TEXT,
    "sumInsured" DECIMAL(16,2),
    "premium" DECIMAL(14,2),
    "totalPremium" DECIMAL(14,2),
    "deductible" DECIMAL(14,2),
    "limit" DECIMAL(16,2),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "policyId" TEXT,
    "notes" TEXT,
    "issuedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoverNote_tenantId_idx" ON "CoverNote"("tenantId");

-- CreateIndex
CREATE INDEX "CoverNote_tenantId_requestId_idx" ON "CoverNote"("tenantId", "requestId");

-- AddForeignKey
ALTER TABLE "CoverNote" ADD CONSTRAINT "CoverNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

