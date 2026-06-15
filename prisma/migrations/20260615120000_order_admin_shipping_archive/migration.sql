-- Admin sipariş yönetimi: iç not, kargo alanları, soft delete
ALTER TABLE "Order" ADD COLUMN "adminNote" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingCarrier" VARCHAR(200);
ALTER TABLE "Order" ADD COLUMN "shippingTrackingNumber" VARCHAR(200);
ALTER TABLE "Order" ADD COLUMN "shippingStatus" VARCHAR(120);
ALTER TABLE "Order" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Order_archivedAt_idx" ON "Order"("archivedAt");
