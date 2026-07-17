-- AlterTable
ALTER TABLE "Slip" ADD COLUMN     "acceptedQuotationId" TEXT,
ADD COLUMN     "clientDecidedAt" TIMESTAMP(3),
ADD COLUMN     "clientDecision" TEXT,
ADD COLUMN     "clientDecisionNote" TEXT,
ADD COLUMN     "presentedAt" TIMESTAMP(3),
ADD COLUMN     "presentedQuotationIds" TEXT[];

