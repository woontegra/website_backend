-- CreateTable
CREATE TABLE "AffiliateLink" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "partnerProductId" TEXT,
    "code" TEXT NOT NULL,
    "customerDiscountRate" INTEGER NOT NULL DEFAULT 0,
    "commissionRatePercent" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateVisit" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "landingPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateLink_code_key" ON "AffiliateLink"("code");

-- CreateIndex
CREATE INDEX "AffiliateLink_partnerId_createdAt_idx" ON "AffiliateLink"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateLink_productId_idx" ON "AffiliateLink"("productId");

-- CreateIndex
CREATE INDEX "AffiliateLink_isActive_idx" ON "AffiliateLink"("isActive");

-- CreateIndex
CREATE INDEX "AffiliateVisit_linkId_createdAt_idx" ON "AffiliateVisit"("linkId", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateVisit_partnerId_createdAt_idx" ON "AffiliateVisit"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateVisit_productId_idx" ON "AffiliateVisit"("productId");

-- CreateIndex
CREATE INDEX "AffiliateVisit_code_idx" ON "AffiliateVisit"("code");

-- AddForeignKey
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_partnerProductId_fkey" FOREIGN KEY ("partnerProductId") REFERENCES "AffiliatePartnerProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateVisit" ADD CONSTRAINT "AffiliateVisit_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "AffiliateLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateVisit" ADD CONSTRAINT "AffiliateVisit_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateVisit" ADD CONSTRAINT "AffiliateVisit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
