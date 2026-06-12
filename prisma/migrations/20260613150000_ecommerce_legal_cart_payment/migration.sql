-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM (
  'PRE_INFORMATION',
  'DISTANCE_SALES',
  'KVKK_CLARIFICATION',
  'EXPLICIT_CONSENT',
  'COMMERCIAL_ELECTRONIC_MESSAGE',
  'TERMS_OF_USE',
  'PRIVACY_POLICY'
);

-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN "preInfoAcceptedAt" TIMESTAMP(3),
ADD COLUMN "distanceSalesAcceptedAt" TIMESTAMP(3),
ADD COLUMN "kvkkReadAt" TIMESTAMP(3),
ADD COLUMN "marketingConsentAt" TIMESTAMP(3),
ADD COLUMN "explicitConsentAt" TIMESTAMP(3),
ADD COLUMN "acceptedIp" TEXT,
ADD COLUMN "acceptedUserAgent" TEXT;

-- CreateTable PaymentSettings
CREATE TABLE "PaymentSettings" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "testMode" BOOLEAN NOT NULL DEFAULT true,
    "merchantId" TEXT NOT NULL DEFAULT '',
    "merchantKeyEncrypted" TEXT NOT NULL DEFAULT '',
    "merchantSaltEncrypted" TEXT NOT NULL DEFAULT '',
    "callbackUrl" TEXT,
    "successUrl" TEXT,
    "failUrl" TEXT,
    "debugOn" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentSettings_provider_key" ON "PaymentSettings"("provider");

-- CreateTable LegalDocument
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "type" "LegalDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LegalDocument_type_isActive_idx" ON "LegalDocument"("type", "isActive");

-- CreateTable OrderLegalSnapshot
CREATE TABLE "OrderLegalSnapshot" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "documentType" "LegalDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "OrderLegalSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderLegalSnapshot_orderId_idx" ON "OrderLegalSnapshot"("orderId");
CREATE INDEX "OrderLegalSnapshot_documentType_idx" ON "OrderLegalSnapshot"("documentType");

ALTER TABLE "OrderLegalSnapshot" ADD CONSTRAINT "OrderLegalSnapshot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PaymentSettings" ("id", "provider", "isActive", "testMode", "merchantId", "merchantKeyEncrypted", "merchantSaltEncrypted", "debugOn", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'PAYTR', false, true, '', '', '', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "PaymentSettings" p WHERE p."provider" = 'PAYTR');

INSERT INTO "LegalDocument" ("id", "type", "title", "content", "version", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'PRE_INFORMATION', 'Ön Bilgilendirme Formu', '<p>Sayın {{customerName}},</p><p>Sipariş no: <strong>{{orderNo}}</strong></p><p>Toplam: {{orderTotal}} {{currency}}</p><h3>Ürünler</h3><p>{{productList}}</p><p>Satıcı: {{sellerTitle}} — {{sellerEmail}} — {{sellerPhone}} — {{sellerAddress}}</p>', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'DISTANCE_SALES', 'Mesafeli Satış Sözleşmesi', '<p>Taraflar: Alıcı {{customerName}} ({{customerEmail}}) ile Satıcı {{sellerTitle}}.</p><p>Sipariş: {{orderNo}} — Tutar: {{orderTotal}} {{currency}}</p><p>Ürünler: {{productList}}</p>', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'KVKK_CLARIFICATION', 'KVKK Aydınlatma Metni', '<p>6698 sayılı KVKK kapsamında kişisel verileriniz sipariş ve ödeme süreçlerinde işlenmektedir. İletişim: {{sellerEmail}}</p>', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'EXPLICIT_CONSENT', 'Açık Rıza Metni', '<p>Pazarlama ve profilleme için açık rıza metni. Onayınız sipariş kaydında saklanır.</p>', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'COMMERCIAL_ELECTRONIC_MESSAGE', 'Ticari İleti Bilgilendirmesi', '<p>Kampanya ve duyurular için elektronik ileti izni kapsamında bilgilendirme.</p>', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
