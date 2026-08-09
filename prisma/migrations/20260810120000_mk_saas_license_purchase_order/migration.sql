ALTER TABLE "Order" ADD COLUMN "mkSaasPurchaseContext" VARCHAR(64);
ALTER TABLE "Order" ADD COLUMN "mkSaasPurchaseSessionId" VARCHAR(64);
ALTER TABLE "Order" ADD COLUMN "mkSaasPurchaseMusteriNo" VARCHAR(32);
ALTER TABLE "Order" ADD COLUMN "mkSaasPurchaseBuroAdi" VARCHAR(255);
ALTER TABLE "Order" ADD COLUMN "mkSaasPurchasePreviousEndDate" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "mkSaasPurchaseNewEndDate" TIMESTAMP(3);
