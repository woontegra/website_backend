-- CreateTable
CREATE TABLE "AffiliatePartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "defaultCommissionRate" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliatePartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePartnerProduct" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "commissionRatePercent" INTEGER NOT NULL,
    "discountRatePercent" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliatePartnerProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePartnerAccess" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdByAdminUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByAdminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliatePartnerAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePartnerMagicToken" (
    "id" TEXT NOT NULL,
    "accessId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliatePartnerMagicToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePartnerSession" (
    "id" TEXT NOT NULL,
    "accessId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliatePartnerSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AffiliatePartner_isActive_createdAt_idx" ON "AffiliatePartner"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliatePartner_name_idx" ON "AffiliatePartner"("name");

-- CreateIndex
CREATE INDEX "AffiliatePartnerProduct_partnerId_idx" ON "AffiliatePartnerProduct"("partnerId");

-- CreateIndex
CREATE INDEX "AffiliatePartnerProduct_productId_idx" ON "AffiliatePartnerProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliatePartnerProduct_partnerId_productId_key" ON "AffiliatePartnerProduct"("partnerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliatePartnerAccess_partnerId_key" ON "AffiliatePartnerAccess"("partnerId");

-- CreateIndex
CREATE INDEX "AffiliatePartnerAccess_email_idx" ON "AffiliatePartnerAccess"("email");

-- CreateIndex
CREATE INDEX "AffiliatePartnerAccess_isRevoked_idx" ON "AffiliatePartnerAccess"("isRevoked");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliatePartnerMagicToken_tokenHash_key" ON "AffiliatePartnerMagicToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AffiliatePartnerMagicToken_accessId_idx" ON "AffiliatePartnerMagicToken"("accessId");

-- CreateIndex
CREATE INDEX "AffiliatePartnerMagicToken_expiresAt_idx" ON "AffiliatePartnerMagicToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliatePartnerSession_tokenHash_key" ON "AffiliatePartnerSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AffiliatePartnerSession_accessId_idx" ON "AffiliatePartnerSession"("accessId");

-- CreateIndex
CREATE INDEX "AffiliatePartnerSession_expiresAt_idx" ON "AffiliatePartnerSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "AffiliatePartnerProduct" ADD CONSTRAINT "AffiliatePartnerProduct_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePartnerProduct" ADD CONSTRAINT "AffiliatePartnerProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePartnerAccess" ADD CONSTRAINT "AffiliatePartnerAccess_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePartnerMagicToken" ADD CONSTRAINT "AffiliatePartnerMagicToken_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "AffiliatePartnerAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePartnerSession" ADD CONSTRAINT "AffiliatePartnerSession_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "AffiliatePartnerAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;
