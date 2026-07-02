-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "businessActivity" TEXT,
ADD COLUMN     "contacts" JSONB,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "legalForm" TEXT,
ADD COLUMN     "producerName" TEXT,
ADD COLUMN     "relationStatus" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "vatNumber" TEXT;

-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "insurerPolicyNo" TEXT,
ADD COLUMN     "issuanceType" TEXT NOT NULL DEFAULT 'POLICY',
ADD COLUMN     "issueDate" TIMESTAMP(3),
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "policyFees" DECIMAL(14,2),
ADD COLUMN     "producerCommission" DECIMAL(14,2),
ADD COLUMN     "producerName" TEXT,
ADD COLUMN     "sumInsured" DECIMAL(16,2);

