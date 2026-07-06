-- CreateTable
CREATE TABLE "TenantEmailSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromEmail" TEXT,
    "fromName" TEXT,
    "resendApiKeyEncrypted" TEXT,
    "domain" TEXT,
    "resendDomainId" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unconfigured',
    "dnsRecords" JSONB,
    "sendingMode" TEXT NOT NULL DEFAULT 'fallback',
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantEmailSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantEmailSettings_tenantId_key" ON "TenantEmailSettings"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantEmailSettings" ADD CONSTRAINT "TenantEmailSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

