-- Havale/EFT onayı sonrası sipariş durumu + banka notları
ALTER TYPE "OrderStatus" ADD VALUE 'PROCESSING';

ALTER TABLE "Order" ADD COLUMN "bankTransferPaymentDate" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "bankTransferAdminNote" TEXT;
ALTER TABLE "Order" ADD COLUMN "bankTransferReference" VARCHAR(500);
ALTER TABLE "Order" ADD COLUMN "paymentConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "paymentConfirmedById" TEXT;
