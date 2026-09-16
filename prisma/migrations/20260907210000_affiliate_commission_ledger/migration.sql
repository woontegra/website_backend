/**
 * Affiliate Faz 3: sipariş ilişkilendirme + değişmez komisyon defteri
 *
 * GÜVENLİK DENETİMİ (production uygulanmadan önce — ajan çalıştırmaz):
 * - Mevcut "Order" satırlarında UPDATE / DELETE / TRUNCATE yok.
 * - Yeni Order kolonlarının tümü NULLABLE; zorunlu DEFAULT veya backfill yok.
 * - Mevcut siparişleri AffiliateCommission satırına dönüştüren INSERT/SELECT yok.
 * - Yalnızca ADD COLUMN IF NOT EXISTS + boş CREATE TABLE IF NOT EXISTS + indeks/FK.
 * - Uygulama sonrası mevcut siparişlerin affiliate* alanları NULL kalır; komisyon oluşmaz.
 */

-- Bu migration ajan tarafından çalıştırılmaz; manuel uygulayın.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "affiliateLinkId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "affiliatePartnerId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "affiliateCode" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "affiliateCustomerDiscountRate" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "campaignDiscountRateSnapshot" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "effectiveCustomerDiscountRate" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "affiliateCommissionStatus" VARCHAR(20);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "affiliateCommissionError" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "affiliateCommissionAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_affiliateLinkId_idx" ON "Order"("affiliateLinkId");
CREATE INDEX IF NOT EXISTS "Order_affiliatePartnerId_idx" ON "Order"("affiliatePartnerId");
CREATE INDEX IF NOT EXISTS "Order_affiliateCommissionStatus_idx" ON "Order"("affiliateCommissionStatus");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_affiliateLinkId_fkey'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_affiliateLinkId_fkey"
      FOREIGN KEY ("affiliateLinkId") REFERENCES "AffiliateLink"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_affiliatePartnerId_fkey'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_affiliatePartnerId_fkey"
      FOREIGN KEY ("affiliatePartnerId") REFERENCES "AffiliatePartner"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AffiliateCommission" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "saleType" VARCHAR(20) NOT NULL,
    "productType" TEXT,
    "subscriptionPeriod" INTEGER,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'TRY',
    "grossPaidAmountKurus" INTEGER NOT NULL,
    "affiliateCustomerDiscountRateSnapshot" INTEGER NOT NULL DEFAULT 0,
    "campaignDiscountRateSnapshot" INTEGER NOT NULL DEFAULT 0,
    "effectiveCustomerDiscountRateSnapshot" INTEGER NOT NULL DEFAULT 0,
    "vatRateSnapshot" INTEGER NOT NULL,
    "commissionBaseAmountKurus" INTEGER NOT NULL,
    "commissionRateSnapshot" INTEGER NOT NULL,
    "commissionAmountKurus" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'EARNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateCommission_orderId_key" ON "AffiliateCommission"("orderId");
CREATE INDEX IF NOT EXISTS "AffiliateCommission_partnerId_createdAt_idx" ON "AffiliateCommission"("partnerId", "createdAt");
CREATE INDEX IF NOT EXISTS "AffiliateCommission_linkId_idx" ON "AffiliateCommission"("linkId");
CREATE INDEX IF NOT EXISTS "AffiliateCommission_productId_idx" ON "AffiliateCommission"("productId");
CREATE INDEX IF NOT EXISTS "AffiliateCommission_status_idx" ON "AffiliateCommission"("status");
CREATE INDEX IF NOT EXISTS "AffiliateCommission_orderNo_idx" ON "AffiliateCommission"("orderNo");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateCommission_orderId_fkey'
  ) THEN
    ALTER TABLE "AffiliateCommission"
      ADD CONSTRAINT "AffiliateCommission_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateCommission_partnerId_fkey'
  ) THEN
    ALTER TABLE "AffiliateCommission"
      ADD CONSTRAINT "AffiliateCommission_partnerId_fkey"
      FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateCommission_linkId_fkey'
  ) THEN
    ALTER TABLE "AffiliateCommission"
      ADD CONSTRAINT "AffiliateCommission_linkId_fkey"
      FOREIGN KEY ("linkId") REFERENCES "AffiliateLink"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateCommission_productId_fkey'
  ) THEN
    ALTER TABLE "AffiliateCommission"
      ADD CONSTRAINT "AffiliateCommission_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
