-- Opsiyonel hesap no (şube ile birlikte gösterim)
ALTER TABLE "BankTransferSettings" ADD COLUMN "accountNumber" TEXT NOT NULL DEFAULT '';
