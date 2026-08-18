import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { builderPagesAdminRoutes } from './builderPages.admin.routes'

describe('builderPagesAdminRoutes auth', () => {
  let server: Server
  let port = 0

  before(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api/admin', builderPagesAdminRoutes)
    server = createServer(app)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    port = (server.address() as AddressInfo).port
  })

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  it('rejects missing admin authorization', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/builder-pages/about`)
    assert.equal(res.status, 401)
    const body = (await res.json()) as { success: boolean }
    assert.equal(body.success, false)
  })

  it('rejects a non-bearer token on draft save', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/builder-pages/about/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { title: 'x' } }),
    })
    assert.equal(res.status, 401)
  })
})
