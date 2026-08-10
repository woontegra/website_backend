-- CreateEnum
CREATE TYPE "DesktopLicenseRenewalSessionStatus" AS ENUM ('CREATED', 'BOUND', 'CONSUMED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "desktopLicensePurchaseContext" VARCHAR(64);
ALTER TABLE "Order" ADD COLUMN "desktopLicenseSessionId" VARCHAR(64);
ALTER TABLE "Order" ADD COLUMN "desktopLicenseId" VARCHAR(64);
ALTER TABLE "Order" ADD COLUMN "desktopLicenseKeyMasked" VARCHAR(64);
ALTER TABLE "Order" ADD COLUMN "desktopLicenseCustomerNumber" VARCHAR(32);
ALTER TABLE "Order" ADD COLUMN "desktopLicensePreviousEndDate" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "desktopLicenseNewEndDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DesktopLicenseRenewalSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "licenseId" TEXT,
    "licenseKeyHash" TEXT NOT NULL,
    "targetLicenseKey" TEXT NOT NULL,
    "appCode" TEXT NOT NULL,
    "productCode" TEXT NOT NULL DEFAULT 'MUVEKKIL_KASA_DESKTOP',
    "deviceHash" TEXT NOT NULL,
    "customerNumber" TEXT,
    "customerName" TEXT,
    "licenseExpiresAt" TIMESTAMP(3),
    "purpose" TEXT NOT NULL DEFAULT 'DESKTOP_LICENSE_RENEWAL',
    "status" "DesktopLicenseRenewalSessionStatus" NOT NULL DEFAULT 'CREATED',
    "boundExternalOrderId" TEXT,
    "boundAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesktopLicenseRenewalSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DesktopLicenseRenewalSession_tokenHash_key" ON "DesktopLicenseRenewalSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "DesktopLicenseRenewalSession_boundExternalOrderId_key" ON "DesktopLicenseRenewalSession"("boundExternalOrderId");

-- CreateIndex
CREATE INDEX "DesktopLicenseRenewalSession_licenseKeyHash_appCode_idx" ON "DesktopLicenseRenewalSession"("licenseKeyHash", "appCode");

-- CreateIndex
CREATE INDEX "DesktopLicenseRenewalSession_status_expiresAt_idx" ON "DesktopLicenseRenewalSession"("status", "expiresAt");
