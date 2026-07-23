-- CreateTable
CREATE TABLE "CrRegistryImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "mtimeMs" BIGINT NOT NULL,
    "rows" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrRegistryImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrRegistryImport_fileName_fileSize_mtimeMs_key" ON "CrRegistryImport"("fileName", "fileSize", "mtimeMs");
