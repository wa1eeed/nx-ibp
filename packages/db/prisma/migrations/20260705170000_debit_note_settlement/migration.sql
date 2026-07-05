-- AlterTable
ALTER TABLE "DebitNote" ADD COLUMN     "settledAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "settledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DebitNote_tenantId_clientId_idx" ON "DebitNote"("tenantId", "clientId");

