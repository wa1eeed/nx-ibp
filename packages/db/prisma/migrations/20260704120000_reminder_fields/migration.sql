-- AlterTable
ALTER TABLE "CrmTask" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "renewalRemindedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Policy_tenantId_status_endDate_idx" ON "Policy"("tenantId", "status", "endDate");

