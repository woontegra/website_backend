import { invalidatePublicCache, PUBLIC_PAGE_CONTENT_CACHE } from '../lib/publicResponseCache'
import { BuilderPagesError } from '../lib/builderPages.errors'
import {
  builderContentsEqual,
  parseBuilderContentInput,
  parseStoredJsonObject,
  serializeBuilderContent,
} from '../lib/builderPages.validation'
import { PublishImageValidationError, validatePageContentPublishImages } from '../lib/publishImageValidation'
import { sanitizeImageFields } from '../utils/sanitizeImageFields'
import { prismaBuilderPagesStore, type BuilderPagesStore } from './builderPages.store'

export type BuilderPageSource = 'builder-draft' | 'page-content' | 'empty'

export type BuilderPageStateDto = {
  pageKey: string
  hasBuilderRecord: boolean
  source: BuilderPageSource
  draftContent: Record<string, unknown> | null
  draftUpdatedAt: string | null
  publishedContent: Record<string, unknown> | null
  publishedAt: string | null
  publishedRevision: number | null
  pageContentUpdatedAt: string | null
}

export type BuilderRevisionListItemDto = {
  id: string
  revision: number
  createdAt: string
  createdByUserId: string | null
  createdByEmail: string | null
}

export type BuilderRevisionDetailDto = BuilderRevisionListItemDto & {
  content: Record<string, unknown>
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function parseOrNull(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null
  return parseStoredJsonObject(raw)
}

export function createBuilderPagesService(store: BuilderPagesStore = prismaBuilderPagesStore) {
  return {
    async getState(pageKey: string): Promise<BuilderPageStateDto> {
      const [builder, published] = await Promise.all([
        store.findBuilderState(pageKey),
        store.findPageContent(pageKey),
      ])

      const publishedContent = parseOrNull(published?.content)
      if (builder) {
        return {
          pageKey,
          hasBuilderRecord: true,
          source: 'builder-draft',
          draftContent: parseOrNull(builder.draftContent),
          draftUpdatedAt: toIso(builder.draftUpdatedAt),
          publishedContent,
          publishedAt: toIso(builder.publishedAt),
          publishedRevision: builder.publishedRevision,
          pageContentUpdatedAt: toIso(published?.updatedAt),
        }
      }

      if (publishedContent) {
        return {
          pageKey,
          hasBuilderRecord: false,
          source: 'page-content',
          draftContent: publishedContent,
          draftUpdatedAt: null,
          publishedContent,
          publishedAt: null,
          publishedRevision: null,
          pageContentUpdatedAt: toIso(published?.updatedAt),
        }
      }

      return {
        pageKey,
        hasBuilderRecord: false,
        source: 'empty',
        draftContent: null,
        draftUpdatedAt: null,
        publishedContent: null,
        publishedAt: null,
        publishedRevision: null,
        pageContentUpdatedAt: null,
      }
    },

    async saveDraft(pageKey: string, rawContent: unknown): Promise<BuilderPageStateDto> {
      const content = parseBuilderContentInput(rawContent)
      if (!content) {
        throw new BuilderPagesError(400, 'Geçerli bir JSON nesnesi gerekli')
      }

      const serialized = serializeBuilderContent(content)
      await store.upsertDraft(pageKey, serialized, new Date())
      return this.getState(pageKey)
    },

    async publish(pageKey: string, createdByUserId?: string | null): Promise<{
      state: BuilderPageStateDto
      revisionCreated: boolean
      revision: number | null
    }> {
      const published = await store.runInTransaction(async (tx) => {
        const builder = await tx.findBuilderState(pageKey)
        if (!builder) {
          throw new BuilderPagesError(409, 'Yayınlanacak taslak yok')
        }

        const draft = parseStoredJsonObject(builder.draftContent)
        if (!draft) {
          throw new BuilderPagesError(400, 'Taslak içeriği geçerli bir JSON nesnesi değil')
        }

        const sanitized = sanitizeImageFields(draft)
        try {
          validatePageContentPublishImages(pageKey, sanitized)
        } catch (err) {
          if (err instanceof PublishImageValidationError) {
            throw new BuilderPagesError(400, err.message)
          }
          throw err
        }

        const serialized = serializeBuilderContent(sanitized)
        const existingPublished = await tx.findPageContent(pageKey)
        const existingParsed = parseOrNull(existingPublished?.content)
        const unchanged = existingParsed !== null && builderContentsEqual(existingParsed, sanitized)
        const needsRevision = !unchanged || builder.publishedRevision == null

        const now = new Date()
        let revisionCreated = false
        let revisionNumber = builder.publishedRevision ?? 0

        if (needsRevision) {
          revisionNumber = (builder.publishedRevision ?? 0) + 1
          await tx.createRevision({
            pageKey,
            content: serialized,
            revision: revisionNumber,
            createdByUserId: createdByUserId ?? null,
            createdAt: now,
          })
          revisionCreated = true
        }

        await tx.upsertPageContent(pageKey, serialized, now)
        await tx.markPublished(pageKey, now, revisionNumber)

        return { revisionCreated, revisionNumber }
      })

      invalidatePublicCache(PUBLIC_PAGE_CONTENT_CACHE, pageKey)
      const state = await this.getState(pageKey)
      return {
        state,
        revisionCreated: published.revisionCreated,
        revision: published.revisionNumber,
      }
    },

    async listRevisions(pageKey: string): Promise<BuilderRevisionListItemDto[]> {
      const rows = await store.listRevisions(pageKey)
      const userIds = [...new Set(rows.map((row) => row.createdByUserId).filter((id): id is string => Boolean(id)))]
      const users = await store.findUsersByIds(userIds)
      const emailById = new Map(users.map((user) => [user.id, user.email]))
      return rows.map((row) => ({
        id: row.id,
        revision: row.revision,
        createdAt: row.createdAt.toISOString(),
        createdByUserId: row.createdByUserId,
        createdByEmail: row.createdByUserId ? emailById.get(row.createdByUserId) ?? null : null,
      }))
    },

    async getRevision(pageKey: string, revisionId: string): Promise<BuilderRevisionDetailDto> {
      const row = await store.findRevision(pageKey, revisionId)
      if (!row) {
        throw new BuilderPagesError(404, 'Sürüm bulunamadı')
      }
      const content = parseStoredJsonObject(row.content)
      if (!content) {
        throw new BuilderPagesError(400, 'Sürüm içeriği okunamadı')
      }
      const users = row.createdByUserId ? await store.findUsersByIds([row.createdByUserId]) : []
      return {
        id: row.id,
        revision: row.revision,
        createdAt: row.createdAt.toISOString(),
        createdByUserId: row.createdByUserId,
        createdByEmail: users[0]?.email ?? null,
        content,
      }
    },
  }
}

export const builderPagesService = createBuilderPagesService()
