import { prisma } from '../lib/prisma'

export type StoredPageContent = {
  content: string
  updatedAt: Date
}

export type StoredBuilderState = {
  id: string
  pageKey: string
  draftContent: string
  draftUpdatedAt: Date
  publishedAt: Date | null
  publishedRevision: number | null
  createdAt: Date
  updatedAt: Date
}

export type StoredRevision = {
  id: string
  pageKey: string
  content: string
  revision: number
  createdByUserId: string | null
  createdAt: Date
}

export type StoredUserRef = {
  id: string
  email: string
}

export type BuilderPagesStore = {
  findPageContent(pageKey: string): Promise<StoredPageContent | null>
  findBuilderState(pageKey: string): Promise<StoredBuilderState | null>
  upsertDraft(pageKey: string, draftContent: string, at: Date): Promise<StoredBuilderState>
  listRevisions(pageKey: string): Promise<Array<Omit<StoredRevision, 'content'>>>
  findRevision(pageKey: string, revisionId: string): Promise<StoredRevision | null>
  findUsersByIds(ids: string[]): Promise<StoredUserRef[]>
  runInTransaction<T>(fn: (tx: BuilderPagesStore) => Promise<T>): Promise<T>
  upsertPageContent(pageKey: string, content: string, at: Date): Promise<void>
  createRevision(input: {
    pageKey: string
    content: string
    revision: number
    createdByUserId: string | null
    createdAt: Date
  }): Promise<StoredRevision>
  markPublished(
    pageKey: string,
    publishedAt: Date,
    publishedRevision: number,
  ): Promise<StoredBuilderState>
}

function createPrismaStore(client: typeof prisma): BuilderPagesStore {
  return {
    findPageContent(pageKey) {
      return client.pageContent.findUnique({
        where: { pageKey },
        select: { content: true, updatedAt: true },
      })
    },
    findBuilderState(pageKey) {
      return client.builderPageState.findUnique({ where: { pageKey } })
    },
    upsertDraft(pageKey, draftContent, at) {
      return client.builderPageState.upsert({
        where: { pageKey },
        create: {
          pageKey,
          draftContent,
          draftUpdatedAt: at,
        },
        update: {
          draftContent,
          draftUpdatedAt: at,
        },
      })
    },
    listRevisions(pageKey) {
      return client.builderPageRevision.findMany({
        where: { pageKey },
        orderBy: { revision: 'desc' },
        select: {
          id: true,
          pageKey: true,
          revision: true,
          createdByUserId: true,
          createdAt: true,
        },
      })
    },
    findRevision(pageKey, revisionId) {
      return client.builderPageRevision.findFirst({
        where: { id: revisionId, pageKey },
      })
    },
    findUsersByIds(ids) {
      if (ids.length === 0) return Promise.resolve([])
      return client.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, email: true },
      })
    },
    async runInTransaction<T>(fn: (tx: BuilderPagesStore) => Promise<T>): Promise<T> {
      return client.$transaction((tx) => fn(createPrismaStore(tx as unknown as typeof prisma)))
    },
    async upsertPageContent(pageKey, content, at) {
      await client.pageContent.upsert({
        where: { pageKey },
        update: { content, updatedAt: at },
        create: { pageKey, content },
      })
    },
    createRevision(input) {
      return client.builderPageRevision.create({
        data: {
          pageKey: input.pageKey,
          content: input.content,
          revision: input.revision,
          createdByUserId: input.createdByUserId,
          createdAt: input.createdAt,
        },
      })
    },
    markPublished(pageKey, publishedAt, publishedRevision) {
      return client.builderPageState.update({
        where: { pageKey },
        data: { publishedAt, publishedRevision, updatedAt: publishedAt },
      })
    },
  }
}

export const prismaBuilderPagesStore: BuilderPagesStore = createPrismaStore(prisma)

export type MemoryBuilderPagesStore = BuilderPagesStore & {
  seedPageContent(pageKey: string, content: string, updatedAt?: Date): void
  seedUser(user: StoredUserRef): void
  setFailOnPageContentUpsert(value: boolean): void
  inspectPageContent(pageKey: string): StoredPageContent | null
  inspectRevisions(): StoredRevision[]
}

export function createMemoryBuilderPagesStore(options?: {
  failOnPageContentUpsert?: boolean
}): MemoryBuilderPagesStore {
  const pageContent = new Map<string, StoredPageContent>()
  const states = new Map<string, StoredBuilderState>()
  const revisions: StoredRevision[] = []
  const users = new Map<string, StoredUserRef>()
  let failOnPageContentUpsert = Boolean(options?.failOnPageContentUpsert)

  function snapshot() {
    return {
      pageContent: new Map(pageContent),
      states: new Map(states),
      revisions: revisions.map((row) => ({ ...row })),
    }
  }

  function restore(snap: ReturnType<typeof snapshot>) {
    pageContent.clear()
    snap.pageContent.forEach((v, k) => pageContent.set(k, v))
    states.clear()
    snap.states.forEach((v, k) => states.set(k, { ...v }))
    revisions.splice(0, revisions.length, ...snap.revisions.map((row) => ({ ...row })))
  }

  const store: BuilderPagesStore = {
    async findPageContent(pageKey) {
      const row = pageContent.get(pageKey)
      return row ? { ...row } : null
    },
    async findBuilderState(pageKey) {
      const row = states.get(pageKey)
      return row ? { ...row } : null
    },
    async upsertDraft(pageKey, draftContent, at) {
      const existing = states.get(pageKey)
      const next: StoredBuilderState = existing
        ? { ...existing, draftContent, draftUpdatedAt: at, updatedAt: at }
        : {
            id: `state-${pageKey}`,
            pageKey,
            draftContent,
            draftUpdatedAt: at,
            publishedAt: null,
            publishedRevision: null,
            createdAt: at,
            updatedAt: at,
          }
      states.set(pageKey, next)
      return { ...next }
    },
    async listRevisions(pageKey) {
      return revisions
        .filter((row) => row.pageKey === pageKey)
        .sort((a, b) => b.revision - a.revision)
        .map(({ content: _content, ...row }) => row)
    },
    async findRevision(pageKey, revisionId) {
      const row = revisions.find((item) => item.pageKey === pageKey && item.id === revisionId)
      return row ? { ...row } : null
    },
    async findUsersByIds(ids) {
      return ids.map((id) => users.get(id)).filter((row): row is StoredUserRef => Boolean(row))
    },
    async runInTransaction<T>(fn: (tx: BuilderPagesStore) => Promise<T>): Promise<T> {
      const snap = snapshot()
      try {
        return await fn(store)
      } catch (err) {
        restore(snap)
        throw err
      }
    },
    async upsertPageContent(pageKey, content, at) {
      if (failOnPageContentUpsert) {
        throw new Error('forced pageContent upsert failure')
      }
      pageContent.set(pageKey, { content, updatedAt: at })
    },
    async createRevision(input) {
      const row: StoredRevision = { id: `rev-${input.pageKey}-${input.revision}`, ...input }
      revisions.push(row)
      return { ...row }
    },
    async markPublished(pageKey, publishedAt, publishedRevision) {
      const existing = states.get(pageKey)
      if (!existing) throw new Error('Builder state missing')
      const next = { ...existing, publishedAt, publishedRevision, updatedAt: publishedAt }
      states.set(pageKey, next)
      return { ...next }
    },
  }

  return Object.assign(store, {
    seedPageContent(pageKey: string, content: string, updatedAt = new Date()) {
      pageContent.set(pageKey, { content, updatedAt })
    },
    seedUser(user: StoredUserRef) {
      users.set(user.id, user)
    },
    setFailOnPageContentUpsert(value: boolean) {
      failOnPageContentUpsert = value
    },
    inspectPageContent(pageKey: string) {
      return pageContent.get(pageKey) ?? null
    },
    inspectRevisions() {
      return revisions.map((row) => ({ ...row }))
    },
  })
}
