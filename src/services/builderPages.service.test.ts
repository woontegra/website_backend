import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { createBuilderPagesService } from './builderPages.service'
import { createMemoryBuilderPagesStore } from './builderPages.store'
import { BuilderPagesError } from '../lib/builderPages.errors'

function createHarness() {
  const store = createMemoryBuilderPagesStore()
  const service = createBuilderPagesService(store)
  return { store, service }
}

describe('builderPagesService', () => {
  it('reads existing PageContent as draft fallback without creating a builder record', async () => {
    const { store, service } = createHarness()
    store.seedPageContent('softwarePage', JSON.stringify({ heroTitle: 'Mevcut' }))

    const state = await service.getState('softwarePage')

    assert.equal(state.hasBuilderRecord, false)
    assert.equal(state.source, 'page-content')
    assert.deepEqual(state.draftContent, { heroTitle: 'Mevcut' })
    assert.deepEqual(state.publishedContent, { heroTitle: 'Mevcut' })
    assert.equal(await store.findBuilderState('softwarePage'), null)
  })

  it('returns a controlled empty state when neither builder nor PageContent exists', async () => {
    const { service } = createHarness()
    const state = await service.getState('missing-page')
    assert.equal(state.source, 'empty')
    assert.equal(state.draftContent, null)
    assert.equal(state.publishedContent, null)
  })

  it('saves a draft without changing PageContent', async () => {
    const { store, service } = createHarness()
    store.seedPageContent('softwarePage', JSON.stringify({ heroTitle: 'Yayında' }))

    await service.saveDraft('softwarePage', { heroTitle: 'Taslak' })

    assert.deepEqual(JSON.parse(store.inspectPageContent('softwarePage')!.content), { heroTitle: 'Yayında' })
    const state = await service.getState('softwarePage')
    assert.equal(state.hasBuilderRecord, true)
    assert.deepEqual(state.draftContent, { heroTitle: 'Taslak' })
    assert.deepEqual(state.publishedContent, { heroTitle: 'Yayında' })
  })

  it('rejects invalid JSON content on draft save', async () => {
    const { service } = createHarness()
    await assert.rejects(
      () => service.saveDraft('softwarePage', '{not-json'),
      (err: unknown) => err instanceof BuilderPagesError && err.status === 400,
    )
    await assert.rejects(
      () => service.saveDraft('softwarePage', ['array-not-object']),
      (err: unknown) => err instanceof BuilderPagesError && err.status === 400,
    )
  })

  it('publishes draft into PageContent and creates a revision', async () => {
    const { store, service } = createHarness()
    store.seedPageContent('softwarePage', JSON.stringify({ heroTitle: 'Eski' }))
    await service.saveDraft('softwarePage', { heroTitle: 'Yeni' })

    const published = await service.publish('softwarePage', 'admin-1')

    assert.equal(published.revisionCreated, true)
    assert.equal(published.revision, 1)
    assert.deepEqual(JSON.parse(store.inspectPageContent('softwarePage')!.content), { heroTitle: 'Yeni' })
    assert.equal(store.inspectRevisions().length, 1)
    assert.deepEqual(published.state.publishedContent, { heroTitle: 'Yeni' })
    assert.ok(published.state.publishedAt)
  })

  it('does not create a duplicate revision when the same content is published again', async () => {
    const { store, service } = createHarness()
    await service.saveDraft('softwarePage', { heroTitle: 'Aynı' })
    await service.publish('softwarePage', 'admin-1')
    const second = await service.publish('softwarePage', 'admin-1')

    assert.equal(second.revisionCreated, false)
    assert.equal(second.revision, 1)
    assert.equal(store.inspectRevisions().length, 1)
  })

  it('rolls back publish when PageContent upsert fails', async () => {
    const { store, service } = createHarness()
    store.seedPageContent('softwarePage', JSON.stringify({ heroTitle: 'Eski' }))
    await service.saveDraft('softwarePage', { heroTitle: 'Yeni' })
    store.setFailOnPageContentUpsert(true)

    await assert.rejects(() => service.publish('softwarePage', 'admin-1'))

    assert.deepEqual(JSON.parse(store.inspectPageContent('softwarePage')!.content), { heroTitle: 'Eski' })
    assert.equal(store.inspectRevisions().length, 0)
    const state = await service.getState('softwarePage')
    assert.equal(state.publishedAt, null)
    assert.deepEqual(state.draftContent, { heroTitle: 'Yeni' })
  })

  it('returns 409 when publishing without a builder draft', async () => {
    const { service } = createHarness()
    await assert.rejects(
      () => service.publish('softwarePage', 'admin-1'),
      (err: unknown) => err instanceof BuilderPagesError && err.status === 409,
    )
  })

  it('does not depend on payment, license, or order modules', () => {
    const src = [
      fs.readFileSync(path.join(__dirname, 'builderPages.service.ts'), 'utf8'),
      fs.readFileSync(path.join(__dirname, 'builderPages.store.ts'), 'utf8'),
    ].join('\n')
    assert.equal(/paytr|orderFulfillment|license\.service|customers\.service/i.test(src), false)
  })
})
