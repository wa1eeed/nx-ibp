-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "pendingApprovals" TEXT[] DEFAULT ARRAY[]::TEXT[];

