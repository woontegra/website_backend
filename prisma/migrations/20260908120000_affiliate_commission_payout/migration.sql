-- AffiliatePayout + AffiliatePayoutItem — komisyon ödeme kaydı (Faz ödeme).
-- GÜVENLİK: Mevcut AffiliateCommission / Order satırlarına UPDATE/DELETE yok.
-- Bu migration ajan tarafından çalıştırılmaz; manuel uygulayın.

CREATE TABLE IF NOT EXISTS "AffiliatePayout" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'TRY',
    "paymentMethod" VARCHAR(40) NOT NULL,
    "reference" VARCHAR(255),
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PAID',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" VARCHAR(80) NOT NULL,
    "createdByAdminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AffiliatePayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliatePayout_idempotencyKey_key"
  ON "AffiliatePayout"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "AffiliatePayout_partnerId_paidAt_idx"
  ON "AffiliatePayout"("partnerId", "paidAt");

CREATE INDEX IF NOT EXISTS "AffiliatePayout_status_idx"
  ON "AffiliatePayout"("status");

CREATE INDEX IF NOT EXISTS "AffiliatePayout_createdAt_idx"
  ON "AffiliatePayout"("createdAt");

DO $$ BEGIN
  ALTER TABLE "AffiliatePayout"
    ADD CONSTRAINT "AffiliatePayout_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AffiliatePayoutItem" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "commissionId" TEXT NOT NULL,
    "allocatedAmountKurus" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliatePayoutItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliatePayoutItem_payoutId_commissionId_key"
  ON "AffiliatePayoutItem"("payoutId", "commissionId");

CREATE INDEX IF NOT EXISTS "AffiliatePayoutItem_payoutId_idx"
  ON "AffiliatePayoutItem"("payoutId");

CREATE INDEX IF NOT EXISTS "AffiliatePayoutItem_commissionId_idx"
  ON "AffiliatePayoutItem"("commissionId");

DO $$ BEGIN
  ALTER TABLE "AffiliatePayoutItem"
    ADD CONSTRAINT "AffiliatePayoutItem_payoutId_fkey"
    FOREIGN KEY ("payoutId") REFERENCES "AffiliatePayout"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AffiliatePayoutItem"
    ADD CONSTRAINT "AffiliatePayoutItem_commissionId_fkey"
    FOREIGN KEY ("commissionId") REFERENCES "AffiliateCommission"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
