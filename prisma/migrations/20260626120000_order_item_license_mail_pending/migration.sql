-- OrderItem: merkezi lisans mail yeniden denemesi için geçici alanlar
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "licenseServerLicenseKey" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "licenseServerActivationPasswordPending" TEXT;
