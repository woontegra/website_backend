-- Kupon tanımları. Kampanya JSON’undan ayrıdır.
-- Yalnızca yeni tablo ve indeks. UPDATE / DELETE / DROP yok.
-- Bu dosya şema kaydıdır; bu çalışma sırasında veritabanına uygulanmaz.

CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "adminNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "discountType" VARCHAR(32) NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "perCustomerLimit" INTEGER,
    "firstPurchaseOnly" BOOLEAN NOT NULL DEFAULT false,
    "minimumCartTotal" DECIMAL(12,2),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CouponProduct" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

CREATE INDEX "Coupon_archivedAt_idx" ON "Coupon"("archivedAt");

CREATE UNIQUE INDEX "CouponProduct_couponId_productId_key" ON "CouponProduct"("couponId", "productId");

CREATE INDEX "CouponProduct_productId_idx" ON "CouponProduct"("productId");

ALTER TABLE "CouponProduct" ADD CONSTRAINT "CouponProduct_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CouponProduct" ADD CONSTRAINT "CouponProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
