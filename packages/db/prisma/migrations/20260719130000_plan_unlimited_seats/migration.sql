-- AlterTable: إلغاء سقف المقاعد — التسعير لكل مستخدم بلا حدّ
ALTER TABLE "Plan" ALTER COLUMN "seatLimit" DROP NOT NULL;
UPDATE "Plan" SET "seatLimit" = NULL;
