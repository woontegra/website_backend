/**
 * Order kupon snapshot kolonları.
 *
 * Yalnızca nullable ADD COLUMN. Mevcut sipariş satırlarında UPDATE / DELETE yok.
 * Bu dosya şema kaydıdır; production veritabanına bu çalışma sırasında uygulanmaz.
 */

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "couponCodeSnapshot" VARCHAR(64);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "couponCampaignSlugSnapshot" VARCHAR(160);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "couponCampaignNameSnapshot" VARCHAR(200);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "couponDiscountTypeSnapshot" VARCHAR(32);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "couponDiscountValueSnapshot" DECIMAL(12,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "couponDiscountAmount" DECIMAL(12,2);

CREATE INDEX IF NOT EXISTS "Order_couponCodeSnapshot_idx" ON "Order" ("couponCodeSnapshot");
