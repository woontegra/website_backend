-- CreateEnum
CREATE TYPE "MediaStorageProvider" AS ENUM ('LOCAL', 'R2');

-- AlterTable
ALTER TABLE "CatalogMedia" ADD COLUMN "storageProvider" "MediaStorageProvider" NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "CatalogMedia" ADD COLUMN "bucket" TEXT;
ALTER TABLE "CatalogMedia" ADD COLUMN "publicUrl" TEXT;
