-- AlterTable
ALTER TABLE "PolicyRequest" ADD COLUMN     "renewedFromPolicyId" TEXT;

-- CreateIndex
CREATE INDEX "PolicyRequest_renewedFromPolicyId_idx" ON "PolicyRequest"("renewedFromPolicyId");

