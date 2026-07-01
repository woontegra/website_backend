-- CreateEnum
CREATE TYPE "CustomerSaasMembershipStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "CustomerSaasMembership" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT,
    "productCode" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantSlug" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "status" "CustomerSaasMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "licenseStartDate" TIMESTAMP(3) NOT NULL,
    "licenseEndDate" TIMESTAMP(3) NOT NULL,
    "firstOrderId" TEXT NOT NULL,
    "lastOrderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSaasMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSaasMembership_tenantId_key" ON "CustomerSaasMembership"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSaasMembership_firstOrderId_key" ON "CustomerSaasMembership"("firstOrderId");

-- CreateIndex
CREATE INDEX "CustomerSaasMembership_customerId_idx" ON "CustomerSaasMembership"("customerId");

-- CreateIndex
CREATE INDEX "CustomerSaasMembership_customerId_productCode_status_idx" ON "CustomerSaasMembership"("customerId", "productCode", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSaasMembership_customerId_productCode_tenantId_key" ON "CustomerSaasMembership"("customerId", "productCode", "tenantId");

-- AddForeignKey
ALTER TABLE "CustomerSaasMembership" ADD CONSTRAINT "CustomerSaasMembership_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSaasMembership" ADD CONSTRAINT "CustomerSaasMembership_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
