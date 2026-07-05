-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "accountManagerId" TEXT;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "currentInsurer" TEXT,
ADD COLUMN     "estimatedPremium" DECIMAL(14,2),
ADD COLUMN     "exclusivity" TEXT,
ADD COLUMN     "expectedCloseDate" TIMESTAMP(3),
ADD COLUMN     "lossRatio" DECIMAL(6,2),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "preferredInsurers" TEXT[],
ADD COLUMN     "producerName" TEXT,
ADD COLUMN     "source" TEXT;

