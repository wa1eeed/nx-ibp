-- CreateTable
CREATE TABLE "Installment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "debitNoteId" TEXT NOT NULL,
    "clientId" TEXT,
    "policyId" TEXT,
    "seq" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "settledAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "settledAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Installment_tenantId_idx" ON "Installment"("tenantId");

-- CreateIndex
CREATE INDEX "Installment_debitNoteId_seq_idx" ON "Installment"("debitNoteId", "seq");

-- CreateIndex
CREATE INDEX "Installment_tenantId_clientId_idx" ON "Installment"("tenantId", "clientId");

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

