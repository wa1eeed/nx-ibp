-- AlterTable
ALTER TABLE "Insurer" ADD COLUMN     "nationalAddress" TEXT,
ADD COLUMN     "vatNumber" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "buildingNo" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "street" TEXT;

