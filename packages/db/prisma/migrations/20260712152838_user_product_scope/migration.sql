-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowedProductLines" TEXT[] DEFAULT ARRAY[]::TEXT[];

