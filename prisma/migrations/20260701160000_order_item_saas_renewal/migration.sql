-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "saas_membership_id" TEXT,
ADD COLUMN "saas_renewal_days" INTEGER;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_saas_membership_id_fkey" FOREIGN KEY ("saas_membership_id") REFERENCES "CustomerSaasMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "OrderItem_saas_membership_id_idx" ON "OrderItem"("saas_membership_id");
