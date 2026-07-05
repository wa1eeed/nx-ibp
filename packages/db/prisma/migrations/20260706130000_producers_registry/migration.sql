-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "producerId" TEXT;

-- CreateTable
CREATE TABLE "Producer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT DEFAULT 'INDIVIDUAL',
    "licenseNo" TEXT,
    "crNumber" TEXT,
    "nationalId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "iban" TEXT,
    "commissionRate" DECIMAL(6,3),
    "status" TEXT DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Producer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Producer_tenantId_idx" ON "Producer"("tenantId");

-- CreateIndex
CREATE INDEX "Policy_tenantId_producerId_idx" ON "Policy"("tenantId", "producerId");

-- AddForeignKey
ALTER TABLE "Producer" ADD CONSTRAINT "Producer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

