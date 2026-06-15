-- Masaüstü / indirilebilir ürün lisansları ve cihaz aktivasyonları
CREATE TYPE "LicenseLifecycleStatus" AS ENUM ('ACTIVE', 'DISABLED', 'EXPIRED');
CREATE TYPE "LicenseActivationStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "unitIndex" INTEGER NOT NULL,
    "customerId" TEXT,
    "customerEmail" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "status" "LicenseLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "maxDevices" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "License_licenseKey_key" ON "License"("licenseKey");
CREATE UNIQUE INDEX "License_orderItemId_unitIndex_key" ON "License"("orderItemId", "unitIndex");
CREATE INDEX "License_orderId_idx" ON "License"("orderId");
CREATE INDEX "License_orderNo_idx" ON "License"("orderNo");
CREATE INDEX "License_customerEmail_idx" ON "License"("customerEmail");

ALTER TABLE "License" ADD CONSTRAINT "License_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "License" ADD CONSTRAINT "License_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "License" ADD CONSTRAINT "License_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "License" ADD CONSTRAINT "License_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LicenseActivation" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "deviceName" TEXT,
    "platform" TEXT,
    "appVersion" TEXT,
    "firstActivatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastValidatedAt" TIMESTAMP(3),
    "status" "LicenseActivationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseActivation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LicenseActivation_licenseId_deviceHash_key" ON "LicenseActivation"("licenseId", "deviceHash");
CREATE INDEX "LicenseActivation_licenseId_idx" ON "LicenseActivation"("licenseId");

ALTER TABLE "LicenseActivation" ADD CONSTRAINT "LicenseActivation_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;
