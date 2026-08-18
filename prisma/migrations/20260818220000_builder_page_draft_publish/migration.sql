-- CreateTable
CREATE TABLE "BuilderPageState" (
    "id" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "draftContent" TEXT NOT NULL,
    "draftUpdatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedRevision" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuilderPageState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuilderPageRevision" (
    "id" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuilderPageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuilderPageState_pageKey_key" ON "BuilderPageState"("pageKey");

-- CreateIndex
CREATE UNIQUE INDEX "BuilderPageRevision_pageKey_revision_key" ON "BuilderPageRevision"("pageKey", "revision");

-- CreateIndex
CREATE INDEX "BuilderPageRevision_pageKey_createdAt_idx" ON "BuilderPageRevision"("pageKey", "createdAt");

-- AddForeignKey
ALTER TABLE "BuilderPageRevision" ADD CONSTRAINT "BuilderPageRevision_pageKey_fkey" FOREIGN KEY ("pageKey") REFERENCES "BuilderPageState"("pageKey") ON DELETE CASCADE ON UPDATE CASCADE;
