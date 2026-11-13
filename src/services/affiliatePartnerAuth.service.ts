import crypto from 'crypto'
import type { Request } from 'express'
import { prisma } from '../lib/prisma'
import {
  AFFILIATE_PARTNER_MAGIC_TTL_MS,
  AFFILIATE_PARTNER_SESSION_COOKIE,
  AFFILIATE_PARTNER_SESSION_TTL_MS,
  AffiliatePartnersError,
  requirePartnerInviteEmail,
} from '../lib/affiliatePartners'
import { buildPartnerMagicAuthUrl } from '../lib/affiliateSiteOrigin'
import { parseRequestCookies } from '../lib/affiliateCookies'

export function hashPartnerToken(raw: string): string {
  return crypto.createHash('sha256').update(String(raw), 'utf8').digest('hex')
}

function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function mapAccess(row: {
  id: string
  partnerId: string
  email: string
  isRevoked: boolean
  createdAt: Date
  updatedAt: Date
  revokedAt: Date | null
}) {
  return {
    id: row.id,
    partnerId: row.partnerId,
    email: row.email,
    isRevoked: row.isRevoked,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }
}

type PartnerAuthDb = Pick<
  typeof prisma,
  | 'affiliatePartner'
  | 'affiliatePartnerAccess'
  | 'affiliatePartnerMagicToken'
  | 'affiliatePartnerSession'
  | '$transaction'
>

/**
 * Admin: Partner Erişimi Oluştur — tek kullanımlık giriş bağlantısı (şifresiz).
 * preferredOrigin: tarayıcıdaki admin paneli kökeni (örn. http://localhost:5174)
 *
 * Magic link TTL: AFFILIATE_PARTNER_MAGIC_TTL_MS (Bilirkişi: 30 dk).
 * Oturum TTL ayrıdır; burada oturum açılmaz.
 */
export async function invitePartnerAccess(input: {
  partnerId: string
  actorUserId?: string | null
  req?: Request | null
  preferredOrigin?: unknown
  db?: PartnerAuthDb
}) {
  const db = input.db ?? prisma
  const partner = await db.affiliatePartner.findUnique({ where: { id: input.partnerId } })
  if (!partner) throw new AffiliatePartnersError('İş ortağı bulunamadı', 404)

  const email = requirePartnerInviteEmail(partner.email)
  const now = new Date()

  let access = await db.affiliatePartnerAccess.findUnique({
    where: { partnerId: input.partnerId },
  })

  if (!access) {
    access = await db.affiliatePartnerAccess.create({
      data: {
        partnerId: input.partnerId,
        email,
        isRevoked: false,
        createdByAdminUserId: input.actorUserId ?? null,
      },
    })
  } else {
    access = await db.affiliatePartnerAccess.update({
      where: { id: access.id },
      data: {
        email,
        isRevoked: false,
        revokedAt: null,
        revokedByAdminUserId: null,
      },
    })
  }

  const rawToken = generateOpaqueToken()
  const tokenHash = hashPartnerToken(rawToken)
  const expiresAt = new Date(now.getTime() + AFFILIATE_PARTNER_MAGIC_TTL_MS)

  await db.affiliatePartnerMagicToken.create({
    data: {
      accessId: access.id,
      tokenHash,
      expiresAt,
    },
  })

  return {
    access: mapAccess(access),
    magicUrl: buildPartnerMagicAuthUrl(rawToken, input.req, input.preferredOrigin),
    expiresAt: expiresAt.toISOString(),
  }
}

export async function revokePartnerAccess(input: {
  partnerId: string
  actorUserId?: string | null
  db?: PartnerAuthDb
}) {
  const db = input.db ?? prisma
  const access = await db.affiliatePartnerAccess.findUnique({
    where: { partnerId: input.partnerId },
  })
  if (!access) throw new AffiliatePartnersError('Partner erişimi bulunamadı', 404)

  const now = new Date()
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.affiliatePartnerAccess.update({
      where: { id: access.id },
      data: {
        isRevoked: true,
        revokedAt: now,
        revokedByAdminUserId: input.actorUserId ?? null,
      },
    })
    await tx.affiliatePartnerSession.updateMany({
      where: { accessId: access.id, revokedAt: null },
      data: { revokedAt: now },
    })
    await tx.affiliatePartnerMagicToken.updateMany({
      where: { accessId: access.id, consumedAt: null },
      data: { consumedAt: now },
    })
    return row
  })

  return { access: mapAccess(updated) }
}

/**
 * Public: magic token tüket → uzun ömürlü oturum.
 * Magic TTL ile session TTL kesinlikle ayrı (Bilirkişi ile aynı: 30 dk / 30 gün).
 */
export async function consumePartnerMagicToken(
  rawToken: string,
  options?: { db?: PartnerAuthDb; now?: Date },
) {
  const db = options?.db ?? prisma
  const now = options?.now ?? new Date()
  const token = String(rawToken ?? '').trim()
  if (!token || token.length < 20) {
    throw new AffiliatePartnersError('Giriş bağlantısı geçersiz veya süresi dolmuş', 401)
  }
  const tokenHash = hashPartnerToken(token)
  const magic = await db.affiliatePartnerMagicToken.findUnique({
    where: { tokenHash },
    include: {
      access: {
        include: {
          partner: { select: { id: true, name: true, email: true, isActive: true } },
        },
      },
    },
  })
  if (!magic) {
    throw new AffiliatePartnersError('Giriş bağlantısı geçersiz veya süresi dolmuş', 401)
  }
  if (magic.consumedAt) {
    throw new AffiliatePartnersError('Giriş bağlantısı geçersiz veya süresi dolmuş', 401)
  }
  if (magic.expiresAt.getTime() <= now.getTime()) {
    throw new AffiliatePartnersError('Giriş bağlantısı geçersiz veya süresi dolmuş', 401)
  }
  if (magic.access.isRevoked || !magic.access.partner.isActive) {
    throw new AffiliatePartnersError('Partner erişimi pasif', 403)
  }

  const rawSession = generateOpaqueToken()
  const sessionHash = hashPartnerToken(rawSession)
  // Oturum süresi magic link süresinden BAĞIMSIZ (Bilirkişi AFFILIATE_PARTNER_SESSION_TTL_MS)
  const sessionExpiresAt = new Date(now.getTime() + AFFILIATE_PARTNER_SESSION_TTL_MS)

  await db.$transaction(async (tx) => {
    const claimed = await tx.affiliatePartnerMagicToken.updateMany({
      where: { id: magic.id, consumedAt: null },
      data: { consumedAt: now },
    })
    if (claimed.count !== 1) {
      throw new AffiliatePartnersError('Giriş bağlantısı geçersiz veya süresi dolmuş', 401)
    }
    await tx.affiliatePartnerSession.create({
      data: {
        accessId: magic.accessId,
        tokenHash: sessionHash,
        expiresAt: sessionExpiresAt,
        lastSeenAt: now,
      },
    })
  })

  return {
    rawSessionToken: rawSession,
    sessionExpiresAt,
    partner: {
      id: magic.access.partner.id,
      name: magic.access.partner.name,
      email: magic.access.partner.email,
    },
  }
}

export async function resolvePartnerSession(
  reqOrRaw: Request | string | null | undefined,
  options?: { db?: PartnerAuthDb; now?: Date },
) {
  const db = options?.db ?? prisma
  const now = options?.now ?? new Date()
  const raw =
    typeof reqOrRaw === 'string' || reqOrRaw == null
      ? String(reqOrRaw ?? '').trim()
      : parseRequestCookies(reqOrRaw)[AFFILIATE_PARTNER_SESSION_COOKIE]?.trim()
  if (!raw) return null
  const tokenHash = hashPartnerToken(raw)
  const session = await db.affiliatePartnerSession.findUnique({
    where: { tokenHash },
    include: {
      access: {
        include: {
          partner: { select: { id: true, name: true, email: true, isActive: true } },
        },
      },
    },
  })
  if (!session || session.revokedAt || session.expiresAt.getTime() <= now.getTime()) return null
  if (session.access.isRevoked || !session.access.partner.isActive) return null

  void db.affiliatePartnerSession
    .update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    })
    .catch(() => undefined)

  return {
    partnerId: session.access.partnerId,
    partner: session.access.partner,
    accessId: session.accessId,
    sessionId: session.id,
  }
}

export async function logoutPartnerSession(
  reqOrRaw: Request | string | null | undefined,
  options?: { db?: PartnerAuthDb },
) {
  const db = options?.db ?? prisma
  const raw =
    typeof reqOrRaw === 'string' || reqOrRaw == null
      ? String(reqOrRaw ?? '').trim()
      : parseRequestCookies(reqOrRaw)[AFFILIATE_PARTNER_SESSION_COOKIE]?.trim()
  if (!raw) return
  const tokenHash = hashPartnerToken(raw)
  await db.affiliatePartnerSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export {
  AFFILIATE_PARTNER_MAGIC_TTL_MS,
  AFFILIATE_PARTNER_SESSION_TTL_MS,
  AFFILIATE_PARTNER_SESSION_COOKIE,
}
