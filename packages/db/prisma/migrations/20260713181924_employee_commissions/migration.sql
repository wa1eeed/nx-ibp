-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "salespersonCommission" DECIMAL(14,2),
ADD COLUMN     "salespersonId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "commissionRate" DECIMAL(6,3);

