-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "amlReviewDue" TIMESTAMP(3),
ADD COLUMN     "amlRiskAssessedAt" TIMESTAMP(3),
ADD COLUMN     "amlRiskLevel" TEXT,
ADD COLUMN     "amlRiskScore" INTEGER;

-- CreateTable
CREATE TABLE "AmlRiskAssessment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "factors" JSONB NOT NULL,
    "rationale" TEXT,
    "assessedById" TEXT,
    "reviewDue" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmlRiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmlScreening" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "screenedName" TEXT NOT NULL,
    "lists" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "matches" JSONB,
    "disposition" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "screenedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmlScreening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuspiciousReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sequenceNo" TEXT,
    "clientId" TEXT,
    "indicators" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reference" TEXT,
    "filedAt" TIMESTAMP(3),
    "filedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuspiciousReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AmlRiskAssessment_tenantId_idx" ON "AmlRiskAssessment"("tenantId");

-- CreateIndex
CREATE INDEX "AmlRiskAssessment_tenantId_clientId_idx" ON "AmlRiskAssessment"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "AmlScreening_tenantId_idx" ON "AmlScreening"("tenantId");

-- CreateIndex
CREATE INDEX "AmlScreening_tenantId_clientId_idx" ON "AmlScreening"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "SuspiciousReport_tenantId_idx" ON "SuspiciousReport"("tenantId");

-- CreateIndex
CREATE INDEX "SuspiciousReport_tenantId_status_idx" ON "SuspiciousReport"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "AmlRiskAssessment" ADD CONSTRAINT "AmlRiskAssessment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmlRiskAssessment" ADD CONSTRAINT "AmlRiskAssessment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmlScreening" ADD CONSTRAINT "AmlScreening_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmlScreening" ADD CONSTRAINT "AmlScreening_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuspiciousReport" ADD CONSTRAINT "SuspiciousReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuspiciousReport" ADD CONSTRAINT "SuspiciousReport_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

