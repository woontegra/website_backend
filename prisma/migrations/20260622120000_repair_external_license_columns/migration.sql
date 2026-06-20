-- Repair: external license columns may be missing on production despite migration history drift.
-- Idempotent: safe to run on DBs where 20260621120000 partially failed or was marked applied without DDL.

-- Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "licenseRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "licenseAppCode" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "licenseDays" INTEGER NOT NULL DEFAULT 365;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "licenseMaxDevices" INTEGER NOT NULL DEFAULT 1;

-- OrderItem
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "licenseServerUnitsNotified" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "licenseServerLastError" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "licenseServerLastNotifiedAt" TIMESTAMP(3);
