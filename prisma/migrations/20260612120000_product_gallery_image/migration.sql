-- CreateTable
CREATE TABLE "ProductGalleryImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductGalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductGalleryImage_productId_mediaId_key" ON "ProductGalleryImage"("productId", "mediaId");

-- CreateIndex
CREATE INDEX "ProductGalleryImage_productId_sortOrder_idx" ON "ProductGalleryImage"("productId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProductGalleryImage" ADD CONSTRAINT "ProductGalleryImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductGalleryImage" ADD CONSTRAINT "ProductGalleryImage_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "CatalogMedia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
