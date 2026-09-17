-- BH Woontegra-central PayTR: product-specific sale metadata on Order (MK pattern).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "bhPurchaseContext" VARCHAR(64);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "bhSaleRef" VARCHAR(64);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "bhProductType" VARCHAR(20);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "bhSubscriptionPeriod" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "bhCampaignPublicCode" VARCHAR(120);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "bhCampaignId" VARCHAR(64);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "bhRenewalSessionId" VARCHAR(64);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "bhQuoteFinalKurus" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "bhQuoteNormalKurus" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "bhFulfillmentStatus" VARCHAR(20);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "bhFulfillmentAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "bhFulfillmentError" TEXT;

CREATE INDEX IF NOT EXISTS "Order_bhSaleRef_idx" ON "Order"("bhSaleRef");
CREATE INDEX IF NOT EXISTS "Order_bhFulfillmentStatus_idx" ON "Order"("bhFulfillmentStatus");
