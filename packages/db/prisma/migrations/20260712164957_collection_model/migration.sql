-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "collectionModel" TEXT NOT NULL DEFAULT 'collect_full';

-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "collectionModel" TEXT;

