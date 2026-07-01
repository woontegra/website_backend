-- Prisma OrderItem alanları camelCase; önceki migration snake_case eklemişti.
ALTER TABLE "OrderItem" RENAME COLUMN "saas_membership_id" TO "saasMembershipId";
ALTER TABLE "OrderItem" RENAME COLUMN "saas_renewal_days" TO "saasRenewalDays";

DROP INDEX IF EXISTS "OrderItem_saas_membership_id_idx";
CREATE INDEX "OrderItem_saasMembershipId_idx" ON "OrderItem"("saasMembershipId");

ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_saas_membership_id_fkey";
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_saasMembershipId_fkey" FOREIGN KEY ("saasMembershipId") REFERENCES "CustomerSaasMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
