-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "eventKey" TEXT NOT NULL,
    "channelEmail" BOOLEAN NOT NULL DEFAULT true,
    "channelSms" BOOLEAN NOT NULL DEFAULT false,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationSetting_tenantId_idx" ON "NotificationSetting"("tenantId");

-- AddForeignKey
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

