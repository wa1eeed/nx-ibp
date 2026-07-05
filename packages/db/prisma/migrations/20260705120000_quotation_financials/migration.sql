-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "commissionAmount" DECIMAL(14,2),
ADD COLUMN     "commissionRate" DECIMAL(6,3),
ADD COLUMN     "policyFees" DECIMAL(14,2),
ADD COLUMN     "sumInsured" DECIMAL(16,2);

