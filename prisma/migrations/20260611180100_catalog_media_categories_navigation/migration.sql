-- CreateEnum
CREATE TYPE "CatalogMediaFileType" AS ENUM ('IMAGE', 'DOWNLOAD', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "NavigationMenuItemType" AS ENUM ('CUSTOM_URL', 'PRODUCT', 'CATEGORY', 'PAGE');

-- CreateTable
CREATE TABLE "CatalogMedia" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileType" "CatalogMediaFileType" NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogMedia_fileType_createdAt_idx" ON "CatalogMedia"("fileType", "createdAt");

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_slug_key" ON "ProductCategory"("slug");

-- CreateIndex
CREATE INDEX "ProductCategory_parentId_sortOrder_idx" ON "ProductCategory"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductCategory_isActive_sortOrder_idx" ON "ProductCategory"("isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT,
ADD COLUMN "seoTitle" TEXT,
ADD COLUMN "seoDescription" TEXT,
ADD COLUMN "coverImageMediaId" TEXT,
ADD COLUMN "downloadMediaId" TEXT;

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_coverImageMediaId_fkey" FOREIGN KEY ("coverImageMediaId") REFERENCES "CatalogMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_downloadMediaId_fkey" FOREIGN KEY ("downloadMediaId") REFERENCES "CatalogMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "NavigationMenuItem" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "NavigationMenuItemType" NOT NULL,
    "url" TEXT,
    "productId" TEXT,
    "categoryId" TEXT,
    "pageId" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "openInNewTab" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NavigationMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NavigationMenuItem_parentId_sortOrder_idx" ON "NavigationMenuItem"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "NavigationMenuItem_isActive_sortOrder_idx" ON "NavigationMenuItem"("isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "NavigationMenuItem" ADD CONSTRAINT "NavigationMenuItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavigationMenuItem" ADD CONSTRAINT "NavigationMenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavigationMenuItem" ADD CONSTRAINT "NavigationMenuItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavigationMenuItem" ADD CONSTRAINT "NavigationMenuItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NavigationMenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
