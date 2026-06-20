-- AlterTable
ALTER TABLE "Product" ADD COLUMN "licenseRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "licenseAppCode" TEXT;
ALTER TABLE "Product" ADD COLUMN "licenseDays" INTEGER;
ALTER TABLE "Product" ADD COLUMN "licenseMaxDevices" INTEGER;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "licenseServerUnitsNotified" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "licenseServerLastError" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "licenseServerLastNotifiedAt" TIMESTAMP(3);
