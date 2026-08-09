-- CreateTable
CREATE TABLE "CustomerPasswordResetToken" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerPasswordResetToken_customerId_createdAt_idx" ON "CustomerPasswordResetToken"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerPasswordResetToken_tokenHash_idx" ON "CustomerPasswordResetToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "CustomerPasswordResetToken" ADD CONSTRAINT "CustomerPasswordResetToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
