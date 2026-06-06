-- CreateTable
CREATE TABLE "DownloadStat" (
    "id" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DownloadStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DownloadStat_productKey_idx" ON "DownloadStat"("productKey");

-- CreateIndex
CREATE UNIQUE INDEX "DownloadStat_productKey_variant_key" ON "DownloadStat"("productKey", "variant");
