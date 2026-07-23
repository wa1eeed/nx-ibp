-- AlterTable
ALTER TABLE "User" ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "baseSalary" DECIMAL(14,2),
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "emergencyContact" TEXT,
ADD COLUMN     "hireDate" TIMESTAMP(3),
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "nationalId" TEXT,
ADD COLUMN     "nationalIdExpiry" TIMESTAMP(3),
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "number" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "doneBy" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeDocument_tenantId_userId_idx" ON "EmployeeDocument"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "EmployeeDocument_tenantId_expiryDate_idx" ON "EmployeeDocument"("tenantId", "expiryDate");

-- CreateIndex
CREATE INDEX "Attendance_tenantId_workDate_idx" ON "Attendance"("tenantId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_tenantId_userId_workDate_key" ON "Attendance"("tenantId", "userId", "workDate");

-- CreateIndex
CREATE INDEX "EmployeeChecklistItem_tenantId_userId_kind_idx" ON "EmployeeChecklistItem"("tenantId", "userId", "kind");

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeChecklistItem" ADD CONSTRAINT "EmployeeChecklistItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
