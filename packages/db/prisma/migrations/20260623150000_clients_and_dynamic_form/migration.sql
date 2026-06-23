-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "RequestLocation" DROP CONSTRAINT "RequestLocation_requestId_fkey";

-- DropForeignKey
ALTER TABLE "RequestMember" DROP CONSTRAINT "RequestMember_requestId_fkey";

-- DropForeignKey
ALTER TABLE "RequestShipment" DROP CONSTRAINT "RequestShipment_requestId_fkey";

-- DropForeignKey
ALTER TABLE "RequestVehicle" DROP CONSTRAINT "RequestVehicle_requestId_fkey";

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "city" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "complianceNote" TEXT,
ADD COLUMN     "complianceStatus" "ComplianceStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "email" TEXT,
ADD COLUMN     "nationalAddress" TEXT,
ADD COLUMN     "phone" TEXT,
ALTER COLUMN "status" SET DEFAULT 'active';

-- DropTable
DROP TABLE "RequestLocation";

-- DropTable
DROP TABLE "RequestMember";

-- DropTable
DROP TABLE "RequestShipment";

-- DropTable
DROP TABLE "RequestVehicle";

-- CreateTable
CREATE TABLE "RequestBlockRow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "blockKey" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "RequestBlockRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequestBlockRow_tenantId_idx" ON "RequestBlockRow"("tenantId");

-- CreateIndex
CREATE INDEX "RequestBlockRow_requestId_blockKey_idx" ON "RequestBlockRow"("requestId", "blockKey");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_code_key" ON "Client"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_crNumber_key" ON "Client"("tenantId", "crNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_nationalId_key" ON "Client"("tenantId", "nationalId");

-- CreateIndex
CREATE INDEX "PolicyRequest_clientId_idx" ON "PolicyRequest"("clientId");

-- AddForeignKey
ALTER TABLE "RequestBlockRow" ADD CONSTRAINT "RequestBlockRow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestBlockRow" ADD CONSTRAINT "RequestBlockRow_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PolicyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

