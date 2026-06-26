-- CreateEnum
CREATE TYPE "ZatcaEnvironment" AS ENUM ('SANDBOX', 'PRE_PRODUCTION', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "ZatcaOnboardingStatus" AS ENUM ('NOT_STARTED', 'CSR_GENERATED', 'COMPLIANCE_PASSED', 'ACTIVE');

-- CreateEnum
CREATE TYPE "BillingDocType" AS ENUM ('TAX_INVOICE', 'DEBIT_NOTE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "BillingSubtype" AS ENUM ('STANDARD_B2B', 'SIMPLIFIED_B2C');

-- CreateTable
CREATE TABLE "TenantZatcaConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vatNumber" TEXT NOT NULL,
    "businessNameAr" TEXT NOT NULL,
    "businessNameEn" TEXT,
    "environment" "ZatcaEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "egsSerialNumber" TEXT,
    "onboardingStatus" "ZatcaOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "privateKeyEnc" TEXT,
    "csrPem" TEXT,
    "complianceCsidEnc" TEXT,
    "productionCsidEnc" TEXT,
    "publicKey" TEXT,
    "lastActivatedAt" TIMESTAMP(3),
    "invoiceCounter" INTEGER NOT NULL DEFAULT 0,
    "lastDocumentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantZatcaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "documentType" "BillingDocType" NOT NULL,
    "invoiceSubtype" "BillingSubtype" NOT NULL DEFAULT 'STANDARD_B2B',
    "serialNumber" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "previousHash" TEXT,
    "hash" TEXT NOT NULL,
    "qrTlv" TEXT NOT NULL,
    "xmlPayload" JSONB,
    "issueDate" TEXT NOT NULL,
    "issueTimestamp" TEXT NOT NULL,
    "supplyDate" TEXT,
    "supplierName" TEXT NOT NULL,
    "supplierVat" TEXT NOT NULL,
    "customerName" TEXT,
    "customerVat" TEXT,
    "customerCrOrId" TEXT,
    "customerAddress" TEXT,
    "clientId" TEXT,
    "policyId" TEXT,
    "lineItems" JSONB NOT NULL,
    "totalExclVat" DECIMAL(14,2) NOT NULL,
    "totalVat" DECIMAL(14,2) NOT NULL,
    "totalInclVat" DECIMAL(14,2) NOT NULL,
    "billingReferenceId" TEXT,
    "reasonForIssuance" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "zatcaFlow" TEXT,
    "zatcaStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "zatcaStampB64" TEXT,
    "zatcaReportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantZatcaConfig_tenantId_key" ON "TenantZatcaConfig"("tenantId");

-- CreateIndex
CREATE INDEX "TenantZatcaConfig_tenantId_idx" ON "TenantZatcaConfig"("tenantId");

-- CreateIndex
CREATE INDEX "BillingDocument_tenantId_idx" ON "BillingDocument"("tenantId");

-- CreateIndex
CREATE INDEX "BillingDocument_clientId_idx" ON "BillingDocument"("clientId");

-- CreateIndex
CREATE INDEX "BillingDocument_policyId_idx" ON "BillingDocument"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingDocument_uuid_key" ON "BillingDocument"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "BillingDocument_tenantId_counter_key" ON "BillingDocument"("tenantId", "counter");

-- CreateIndex
CREATE UNIQUE INDEX "BillingDocument_tenantId_serialNumber_key" ON "BillingDocument"("tenantId", "serialNumber");

-- AddForeignKey
ALTER TABLE "TenantZatcaConfig" ADD CONSTRAINT "TenantZatcaConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

