-- AlterEnum
ALTER TYPE "LegalDocumentType" ADD VALUE 'SOFTWARE_LICENSE';
ALTER TYPE "LegalDocumentType" ADD VALUE 'SAAS_SUBSCRIPTION';
ALTER TYPE "LegalDocumentType" ADD VALUE 'DIGITAL_IMMEDIATE_DELIVERY_WAIVER';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "softwareLicenseAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "saasSubscriptionAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "digitalProductWaiverAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "digitalServiceWaiverAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "legalCartProductTypes" TEXT;
