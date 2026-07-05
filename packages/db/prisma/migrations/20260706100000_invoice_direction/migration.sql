-- AlterTable
ALTER TABLE "CreditNote" ADD COLUMN     "insurerName" TEXT,
ADD COLUMN     "kind" TEXT DEFAULT 'CNP';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "kind" TEXT DEFAULT 'COMMISSION';

-- CreateIndex
CREATE INDEX "Invoice_tenantId_clientId_idx" ON "Invoice"("tenantId", "clientId");

