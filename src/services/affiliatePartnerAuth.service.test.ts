import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import crypto from 'crypto'
import {
  AFFILIATE_PARTNER_MAGIC_TTL_MS,
  AFFILIATE_PARTNER_SESSION_COOKIE,
  AFFILIATE_PARTNER_SESSION_TTL_MS,
} from '../lib/affiliatePartners'
import {
  buildPartnerSessionSetCookieHeader,
  partnerSessionCookieOptions,
} from '../lib/affiliateCookies'
import {
  consumePartnerMagicToken,
  hashPartnerToken,
  logoutPartnerSession,
  resolvePartnerSession,
  revokePartnerAccess,
} from '../services/affiliatePartnerAuth.service'

type MagicRow = {
  id: string
  accessId: string
  tokenHash: string
  expiresAt: Date
  consumedAt: Date | null
  access: AccessRow
}

type SessionRow = {
  id: string
  accessId: string
  tokenHash: string
  expiresAt: Date
  revokedAt: Date | null
  lastSeenAt: Date | null
  access: AccessRow
}

type AccessRow = {
  id: string
  partnerId: string
  email: string
  isRevoked: boolean
  createdAt: Date
  updatedAt: Date
  revokedAt: Date | null
  revokedByAdminUserId: string | null
  createdByAdminUserId: string | null
  partner: { id: string; name: string; email: string | null; isActive: boolean }
}

function createMemoryDb(seed: {
  access: AccessRow
  magics?: MagicRow[]
  sessions?: SessionRow[]
}) {
  const magics = new Map<string, MagicRow>((seed.magics ?? []).map((m) => [m.id, { ...m, access: seed.access }]))
  const sessions = new Map<string, SessionRow>((seed.sessions ?? []).map((s) => [s.id, { ...s, access: seed.access }]))
  let access = { ...seed.access }

  const api = {
    affiliatePartner: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === access.partnerId ? access.partner : null,
    },
    affiliatePartnerAccess: {
      findUnique: async ({ where }: { where: { partnerId: string } }) =>
        where.partnerId === access.partnerId ? access : null,
      create: async () => access,
      update: async ({ data }: { where: { id: string }; data: Partial<AccessRow> }) => {
        access = { ...access, ...data, updatedAt: new Date() }
        for (const m of magics.values()) m.access = access
        for (const s of sessions.values()) s.access = access
        return access
      },
    },
    affiliatePartnerMagicToken: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        for (const m of magics.values()) {
          if (m.tokenHash === where.tokenHash) return { ...m, access }
        }
        return null
      },
      create: async ({ data }: { data: { accessId: string; tokenHash: string; expiresAt: Date } }) => {
        const row: MagicRow = {
          id: crypto.randomUUID(),
          accessId: data.accessId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          consumedAt: null,
          access,
        }
        magics.set(row.id, row)
        return row
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id?: string; accessId?: string; consumedAt: null }
        data: { consumedAt: Date }
      }) => {
        let count = 0
        for (const m of magics.values()) {
          const idOk = where.id ? m.id === where.id : true
          const accessOk = where.accessId ? m.accessId === where.accessId : true
          if (idOk && accessOk && m.consumedAt === null) {
            m.consumedAt = data.consumedAt
            count += 1
          }
        }
        return { count }
      },
    },
    affiliatePartnerSession: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        for (const s of sessions.values()) {
          if (s.tokenHash === where.tokenHash) return { ...s, access }
        }
        return null
      },
      create: async ({
        data,
      }: {
        data: { accessId: string; tokenHash: string; expiresAt: Date; lastSeenAt?: Date }
      }) => {
        const row: SessionRow = {
          id: crypto.randomUUID(),
          accessId: data.accessId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          revokedAt: null,
          lastSeenAt: data.lastSeenAt ?? null,
          access,
        }
        sessions.set(row.id, row)
        return row
      },
      update: async ({ where, data }: { where: { id: string }; data: { lastSeenAt: Date } }) => {
        const row = sessions.get(where.id)
        if (!row) throw new Error('missing session')
        row.lastSeenAt = data.lastSeenAt
        return row
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { tokenHash?: string; accessId?: string; revokedAt: null }
        data: { revokedAt: Date }
      }) => {
        let count = 0
        for (const s of sessions.values()) {
          const tokenOk = where.tokenHash ? s.tokenHash === where.tokenHash : true
          const accessOk = where.accessId ? s.accessId === where.accessId : true
          if (tokenOk && accessOk && s.revokedAt === null) {
            s.revokedAt = data.revokedAt
            count += 1
          }
        }
        return { count }
      },
    },
    $transaction: async <T>(fn: (tx: typeof api) => Promise<T>) => fn(api),
    _magics: magics,
    _sessions: sessions,
    _access: () => access,
  }

  return api
}

describe('affiliate partner auth TTLs (Bilirkişi-aligned)', () => {
  it('keeps magic link TTL and session TTL distinct', () => {
    assert.equal(AFFILIATE_PARTNER_MAGIC_TTL_MS, 30 * 60 * 1000)
    assert.equal(AFFILIATE_PARTNER_SESSION_TTL_MS, 30 * 24 * 60 * 60 * 1000)
    assert.notEqual(AFFILIATE_PARTNER_MAGIC_TTL_MS, AFFILIATE_PARTNER_SESSION_TTL_MS)
    assert.equal(AFFILIATE_PARTNER_SESSION_COOKIE, 'wt_partner_sid')
  })

  it('sets session cookie Max-Age from session expiry (~30d), not magic (~30m)', () => {
    const now = Date.now()
    const sessionExpires = new Date(now + AFFILIATE_PARTNER_SESSION_TTL_MS)
    const opts = partnerSessionCookieOptions(sessionExpires)
    assert.ok(opts.maxAgeSec > 29 * 24 * 60 * 60)
    assert.ok(opts.maxAgeSec <= 30 * 24 * 60 * 60)
    const header = buildPartnerSessionSetCookieHeader('session-raw-token-value', sessionExpires)
    assert.match(header, new RegExp(`^${AFFILIATE_PARTNER_SESSION_COOKIE}=`))
    assert.match(header, /Max-Age=\d+/)
    assert.match(header, /Expires=/)
    assert.match(header, /HttpOnly/)
    assert.match(header, /SameSite=Lax/)
    const maxAge = Number(header.match(/Max-Age=(\d+)/)?.[1])
    assert.ok(maxAge > AFFILIATE_PARTNER_MAGIC_TTL_MS / 1000)
  })
})

describe('affiliate partner auth flow', () => {
  function seedAccess(): AccessRow {
    const partnerId = 'partner-1'
    return {
      id: 'access-1',
      partnerId,
      email: 'ortak@example.com',
      isRevoked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: null,
      revokedByAdminUserId: null,
      createdByAdminUserId: null,
      partner: {
        id: partnerId,
        name: 'Demo Ortak',
        email: 'ortak@example.com',
        isActive: true,
      },
    }
  }

  it('consumes magic once; session outlives magic TTL; refresh resolve works', async () => {
    const access = seedAccess()
    const rawMagic = 'a'.repeat(32)
    const magicExpires = new Date(Date.now() + AFFILIATE_PARTNER_MAGIC_TTL_MS)
    const db = createMemoryDb({
      access,
      magics: [
        {
          id: 'magic-1',
          accessId: access.id,
          tokenHash: hashPartnerToken(rawMagic),
          expiresAt: magicExpires,
          consumedAt: null,
          access,
        },
      ],
    })

    const consumed = await consumePartnerMagicToken(rawMagic, { db: db as never, now: new Date() })
    assert.ok(consumed.rawSessionToken.length >= 20)
    const sessionTtlMs = consumed.sessionExpiresAt.getTime() - Date.now()
    assert.ok(sessionTtlMs > 29 * 24 * 60 * 60 * 1000)
    assert.ok(sessionTtlMs <= AFFILIATE_PARTNER_SESSION_TTL_MS)

    await assert.rejects(
      () => consumePartnerMagicToken(rawMagic, { db: db as never }),
      (err: unknown) =>
        err instanceof Error && err.message === 'Giriş bağlantısı geçersiz veya süresi dolmuş',
    )

    // Magic link süresi dolmuş olsa bile oturum geçerli kalmalı
    const afterMagicWouldExpire = new Date(magicExpires.getTime() + 60_000)
    const resolved = await resolvePartnerSession(consumed.rawSessionToken, {
      db: db as never,
      now: afterMagicWouldExpire,
    })
    assert.ok(resolved)
    assert.equal(resolved.partnerId, access.partnerId)

    // Sayfa yenileme / tekrar resolve
    const again = await resolvePartnerSession(consumed.rawSessionToken, {
      db: db as never,
      now: afterMagicWouldExpire,
    })
    assert.ok(again)
    assert.equal(again.sessionId, resolved.sessionId)
  })

  it('logout revokes the current session cookie', async () => {
    const access = seedAccess()
    const rawMagic = 'b'.repeat(32)
    const db = createMemoryDb({
      access,
      magics: [
        {
          id: 'magic-2',
          accessId: access.id,
          tokenHash: hashPartnerToken(rawMagic),
          expiresAt: new Date(Date.now() + AFFILIATE_PARTNER_MAGIC_TTL_MS),
          consumedAt: null,
          access,
        },
      ],
    })
    const consumed = await consumePartnerMagicToken(rawMagic, { db: db as never })
    assert.ok(await resolvePartnerSession(consumed.rawSessionToken, { db: db as never }))
    await logoutPartnerSession(consumed.rawSessionToken, { db: db as never })
    assert.equal(await resolvePartnerSession(consumed.rawSessionToken, { db: db as never }), null)
  })

  it('admin revoke closes open sessions and burns unused magic links', async () => {
    const access = seedAccess()
    const rawMagic = 'c'.repeat(32)
    const unusedMagic = 'd'.repeat(32)
    const db = createMemoryDb({
      access,
      magics: [
        {
          id: 'magic-3',
          accessId: access.id,
          tokenHash: hashPartnerToken(rawMagic),
          expiresAt: new Date(Date.now() + AFFILIATE_PARTNER_MAGIC_TTL_MS),
          consumedAt: null,
          access,
        },
        {
          id: 'magic-4',
          accessId: access.id,
          tokenHash: hashPartnerToken(unusedMagic),
          expiresAt: new Date(Date.now() + AFFILIATE_PARTNER_MAGIC_TTL_MS),
          consumedAt: null,
          access,
        },
      ],
    })
    const consumed = await consumePartnerMagicToken(rawMagic, { db: db as never })
    assert.ok(await resolvePartnerSession(consumed.rawSessionToken, { db: db as never }))

    await revokePartnerAccess({ partnerId: access.partnerId, db: db as never })
    assert.equal(await resolvePartnerSession(consumed.rawSessionToken, { db: db as never }), null)
    await assert.rejects(
      () => consumePartnerMagicToken(unusedMagic, { db: db as never }),
      (err: unknown) =>
        err instanceof Error && err.message === 'Giriş bağlantısı geçersiz veya süresi dolmuş',
    )
  })
})
