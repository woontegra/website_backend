-- CreateTable
CREATE TABLE "OrderLegalArchiveFile" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "packageNo" TEXT NOT NULL,
    "documentType" "LegalDocumentType",
    "fileCategory" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "acceptanceCode" TEXT,
    "version" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLegalArchiveFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderLegalArchiveFile_orderId_fileName_key" ON "OrderLegalArchiveFile"("orderId", "fileName");

-- CreateIndex
CREATE INDEX "OrderLegalArchiveFile_orderId_idx" ON "OrderLegalArchiveFile"("orderId");

-- CreateIndex
CREATE INDEX "OrderLegalArchiveFile_packageNo_idx" ON "OrderLegalArchiveFile"("packageNo");

-- AddForeignKey
ALTER TABLE "OrderLegalArchiveFile" ADD CONSTRAINT "OrderLegalArchiveFile_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
