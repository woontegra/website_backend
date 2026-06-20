-- CreateEnum
CREATE TYPE "LicenseSource" AS ENUM ('MANUAL', 'WEBSITE_ORDER');

-- AlterTable: nullable order fields for manual licenses
ALTER TABLE "License" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "License" ALTER COLUMN "orderNo" DROP NOT NULL;
ALTER TABLE "License" ALTER COLUMN "orderItemId" DROP NOT NULL;
ALTER TABLE "License" ALTER COLUMN "unitIndex" DROP NOT NULL;

-- AlterTable: new license fields
ALTER TABLE "License" ADD COLUMN "activationPasswordHash" TEXT;
ALTER TABLE "License" ADD COLUMN "customerName" TEXT;
ALTER TABLE "License" ADD COLUMN "customerPhone" TEXT;
ALTER TABLE "License" ADD COLUMN "productCode" TEXT;
ALTER TABLE "License" ADD COLUMN "source" "LicenseSource" NOT NULL DEFAULT 'WEBSITE_ORDER';
ALTER TABLE "License" ADD COLUMN "startsAt" TIMESTAMP(3);
ALTER TABLE "License" ADD COLUMN "notes" TEXT;

-- CreateIndex
CREATE INDEX "License_source_idx" ON "License"("source");
CREATE INDEX "License_productCode_idx" ON "License"("productCode");

-- Backfill existing rows
UPDATE "License" SET "source" = 'WEBSITE_ORDER' WHERE "source" IS NULL;
