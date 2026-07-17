-- CreateTable
CREATE TABLE "PortalPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "debitNoteId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "gateway" TEXT NOT NULL,
    "gatewayChargeId" TEXT,
    "redirectUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "receiptVoucherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalPayment_tenantId_idx" ON "PortalPayment"("tenantId");

-- CreateIndex
CREATE INDEX "PortalPayment_gatewayChargeId_idx" ON "PortalPayment"("gatewayChargeId");

-- CreateIndex
CREATE INDEX "PortalPayment_clientId_idx" ON "PortalPayment"("clientId");

-- AddForeignKey
ALTER TABLE "PortalPayment" ADD CONSTRAINT "PortalPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

