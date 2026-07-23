-- CreateTable
CREATE TABLE "CrRegistryRecord" (
    "id" TEXT NOT NULL,
    "crNumber" TEXT NOT NULL,
    "unifiedNumber" TEXT,
    "name" TEXT NOT NULL,
    "activity" TEXT,
    "legalEntity" TEXT,
    "issueDate" TIMESTAMP(3),
    "region" TEXT,
    "city" TEXT,
    "capital" DECIMAL(18,2),
    "registryType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'opendata_mc_2026q1',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrRegistryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrRegistryRecord_crNumber_key" ON "CrRegistryRecord"("crNumber");

-- CreateIndex
CREATE INDEX "CrRegistryRecord_name_idx" ON "CrRegistryRecord"("name");
