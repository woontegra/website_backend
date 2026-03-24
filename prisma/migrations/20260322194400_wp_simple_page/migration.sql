-- Simplify CMS: tek HTML alanı (content), builder tabloları kaldırıldı

-- DropForeignKey
ALTER TABLE "SectionItem" DROP CONSTRAINT IF EXISTS "SectionItem_sectionId_fkey";
ALTER TABLE "Section" DROP CONSTRAINT IF EXISTS "Section_pageId_fkey";
ALTER TABLE "PageContent" DROP CONSTRAINT IF EXISTS "PageContent_pageId_fkey";
ALTER TABLE "Faq" DROP CONSTRAINT IF EXISTS "Faq_pageId_fkey";
ALTER TABLE "MenuItem" DROP CONSTRAINT IF EXISTS "MenuItem_pageId_fkey";

-- DropTable
DROP TABLE IF EXISTS "SectionItem";
DROP TABLE IF EXISTS "Section";
DROP TABLE IF EXISTS "PageContent";
DROP TABLE IF EXISTS "Faq";

-- Page: bodyHtml -> content, gereksiz sütunlar kaldır
ALTER TABLE "Page" RENAME COLUMN "bodyHtml" TO "content";
ALTER TABLE "Page" DROP COLUMN IF EXISTS "category";
ALTER TABLE "Page" DROP COLUMN IF EXISTS "metaDescription";
ALTER TABLE "Page" DROP COLUMN IF EXISTS "metaTitle";
ALTER TABLE "Page" DROP COLUMN IF EXISTS "featuredImage";
ALTER TABLE "Page" DROP COLUMN IF EXISTS "isActive";

UPDATE "Page" SET "content" = '' WHERE "content" IS NULL;
ALTER TABLE "Page" ALTER COLUMN "content" SET NOT NULL;
ALTER TABLE "Page" ALTER COLUMN "content" SET DEFAULT '';

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;
