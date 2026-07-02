-- CreateTable
CREATE TABLE "TenantStorage" (
    "tenantId" TEXT NOT NULL,
    "usedBytes" BIGINT NOT NULL DEFAULT 0,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantStorage_tenantId_key" ON "TenantStorage"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantStorage" ADD CONSTRAINT "TenantStorage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

