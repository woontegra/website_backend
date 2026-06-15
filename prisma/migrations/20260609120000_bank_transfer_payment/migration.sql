-- Havale/EFT ödeme sağlayıcısı
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'BANK_TRANSFER';

-- Tek satır banka bilgisi (admin panelden yönetim ileride eklenebilir)
CREATE TABLE "BankTransferSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "bankName" TEXT NOT NULL DEFAULT '',
    "branchName" TEXT NOT NULL DEFAULT '',
    "accountHolder" TEXT NOT NULL DEFAULT '',
    "iban" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "referenceNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransferSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "BankTransferSettings" ("id", "isPublished", "bankName", "branchName", "accountHolder", "iban", "currency", "referenceNote", "createdAt", "updatedAt")
SELECT 'default', false, '', '', '', '', 'TRY', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "BankTransferSettings" WHERE "id" = 'default');
