-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "ServiceRequest_tenantId_assigneeId_status_idx" ON "ServiceRequest"("tenantId", "assigneeId", "status");

