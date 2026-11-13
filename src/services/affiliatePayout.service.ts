/**
 * İş ortağı komisyon ödemesi — Bilirkişi createAffiliatePayout ile aynı mantık.
 * Otomatik banka transferi yok; yalnız defter kaydı.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AFFILIATE_COMMISSION_STATUS } from '../lib/affiliateCommissionEvaluate'
import {
  AFFILIATE_PAYOUT_METHODS,
  AFFILIATE_PAYOUT_STATUS,
  deriveCommissionPayoutStatus,
  type AffiliatePayoutMethod,
} from '../lib/affiliatePayout'

export class AffiliatePayoutError extends Error {
  status: number
  code: string
  constructor(message: string, { status = 400, code = 'AFFILIATE_PAYOUT' }: { status?: number; code?: string } = {}) {
    super(message)
    this.name = 'AffiliatePayoutError'
    this.status = status
    this.code = code
  }
}

const PAYABLE_STATUSES = [
  AFFILIATE_COMMISSION_STATUS.EARNED,
  AFFILIATE_COMMISSION_STATUS.PARTIALLY_PAID,
] as string[]

export type PayoutAllocationInput = { commissionId: string; amountKurus: number }

export type CreateAffiliatePayoutInput = {
  partnerId: string
  allocations: PayoutAllocationInput[]
  paymentMethod: string
  reference?: string | null
  notes?: string | null
  paidAt?: string | null
  idempotencyKey: string
  actorUserId?: string | null
}

type PayoutDb = {
  affiliatePayout: {
    findUnique: (args: unknown) => Promise<unknown>
    create: (args: unknown) => Promise<unknown>
  }
  affiliatePartner: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>
  }
  affiliatePayoutItem: {
    groupBy: typeof prisma.affiliatePayoutItem.groupBy
  }
  affiliateCommission: {
    findMany: (args: unknown) => Promise<
      { id: string; partnerId: string; status: string; commissionAmountKurus: number }[]
    >
    updateMany: (args: unknown) => Promise<{ count: number }>
  }
  $queryRaw: (...args: unknown[]) => Promise<unknown>
  $transaction: <T>(fn: (tx: PayoutDb) => Promise<T>) => Promise<T>
}

async function getPaidAmountsByCommissionIds(
  commissionIds: string[],
  db: { affiliatePayoutItem: { groupBy: typeof prisma.affiliatePayoutItem.groupBy } },
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (const id of commissionIds) map.set(id, 0)
  if (!commissionIds.length) return map
  const rows = await db.affiliatePayoutItem.groupBy({
    by: ['commissionId'],
    where: { commissionId: { in: commissionIds } },
    _sum: { allocatedAmountKurus: true },
  })
  for (const row of rows) {
    map.set(row.commissionId, row._sum.allocatedAmountKurus ?? 0)
  }
  return map
}

function parsePaymentMethod(raw: unknown): AffiliatePayoutMethod {
  const v = String(raw ?? '')
    .trim()
    .toUpperCase()
  if (!(Object.values(AFFILIATE_PAYOUT_METHODS) as string[]).includes(v)) {
    throw new AffiliatePayoutError('Ödeme yöntemi geçersiz. Havale/EFT, Nakit veya Diğer seçin.')
  }
  return v as AffiliatePayoutMethod
}

function parseIdempotencyKey(raw: unknown): string {
  const key = String(raw ?? '').trim()
  if (!key || key.length < 8 || key.length > 80) {
    throw new AffiliatePayoutError('İşlem anahtarı 8–80 karakter olmalıdır.')
  }
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    throw new AffiliatePayoutError('İşlem anahtarı geçersiz karakter içeriyor.')
  }
  return key
}

function parseAllocations(raw: unknown): PayoutAllocationInput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AffiliatePayoutError('En az bir komisyon için ödeme tutarı girin.')
  }
  const byId = new Map<string, number>()
  for (const row of raw) {
    const rec = row as Record<string, unknown>
    const commissionId = String(rec.commissionId ?? '').trim()
    const amountKurus = Number(rec.amountKurus)
    if (!commissionId) throw new AffiliatePayoutError('Komisyon seçimi zorunludur.')
    if (!Number.isInteger(amountKurus) || amountKurus <= 0) {
      throw new AffiliatePayoutError('Ödeme tutarı sıfırdan büyük olmalıdır.', {
        code: 'AFFILIATE_PAYOUT_INVALID_ALLOCATION',
      })
    }
    if (byId.has(commissionId)) {
      throw new AffiliatePayoutError('Aynı komisyon birden fazla kez seçilemez.', {
        code: 'AFFILIATE_PAYOUT_DUPLICATE_ALLOCATION',
      })
    }
    byId.set(commissionId, amountKurus)
  }
  if (byId.size > 100) throw new AffiliatePayoutError('Tek seferde en fazla 100 komisyon ödenebilir.')
  return [...byId.entries()].map(([commissionId, amountKurus]) => ({ commissionId, amountKurus }))
}

function mapPayoutDto(row: {
  id: string
  amountKurus: number
  currency: string
  paymentMethod: string
  reference: string | null
  notes: string | null
  status: string
  paidAt: Date | string
  createdAt: Date | string
  items?: { commissionId: string; allocatedAmountKurus: number }[]
}) {
  const paidAt = row.paidAt instanceof Date ? row.paidAt.toISOString() : String(row.paidAt)
  const createdAt = row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)
  return {
    id: row.id,
    amountKurus: row.amountKurus,
    currency: row.currency,
    paymentMethod: row.paymentMethod,
    reference: row.reference,
    notes: row.notes,
    status: row.status,
    paidAt,
    createdAt,
    items: (row.items ?? []).map((i) => ({
      commissionId: i.commissionId,
      allocatedAmountKurus: i.allocatedAmountKurus,
    })),
  }
}

export const affiliatePayoutService = {
  async listEarnedForPayout(partnerId: string) {
    const rows = await prisma.affiliateCommission.findMany({
      where: {
        partnerId,
        status: { in: PAYABLE_STATUSES },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        orderNo: true,
        productNameSnapshot: true,
        saleType: true,
        commissionAmountKurus: true,
        status: true,
        createdAt: true,
      },
    })
    const paidMap = await getPaidAmountsByCommissionIds(
      rows.map((r) => r.id),
      prisma,
    )
    const items = rows
      .map((r) => {
        const paid = paidMap.get(r.id) ?? 0
        const remaining = Math.max(0, r.commissionAmountKurus - paid)
        return {
          id: r.id,
          orderNo: r.orderNo,
          productName: r.productNameSnapshot,
          saleType: r.saleType,
          commissionAmountKurus: r.commissionAmountKurus,
          paidAmountKurus: paid,
          remainingAmountKurus: remaining,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        }
      })
      .filter((r) => r.remainingAmountKurus > 0)
    return { items }
  },

  async createPayout(input: CreateAffiliatePayoutInput, opts?: { db?: PayoutDb }) {
    const db = (opts?.db ?? (prisma as unknown as PayoutDb)) as PayoutDb
    const partnerId = String(input.partnerId ?? '').trim()
    if (!partnerId) throw new AffiliatePayoutError('İş ortağı bulunamadı', { status: 404 })

    const method = parsePaymentMethod(input.paymentMethod)
    const key = parseIdempotencyKey(input.idempotencyKey)
    const allocations = parseAllocations(input.allocations)
    const paidAtDate = input.paidAt ? new Date(input.paidAt) : new Date()
    if (Number.isNaN(paidAtDate.getTime())) {
      throw new AffiliatePayoutError('Ödeme tarihi geçersiz.')
    }
    const reference =
      input.reference == null || String(input.reference).trim() === ''
        ? null
        : String(input.reference).trim().slice(0, 255)
    const notes =
      input.notes == null || String(input.notes).trim() === ''
        ? null
        : String(input.notes).trim().slice(0, 4000)

    const existing = (await db.affiliatePayout.findUnique({
      where: { idempotencyKey: key },
      include: { items: true },
    })) as (Parameters<typeof mapPayoutDto>[0] & { partnerId: string }) | null
    if (existing) {
      if (existing.partnerId !== partnerId) {
        throw new AffiliatePayoutError('Bu işlem anahtarı başka bir iş ortağı için kullanılmış.', {
          status: 409,
          code: 'AFFILIATE_PAYOUT_IDEMPOTENCY_CONFLICT',
        })
      }
      return { payout: mapPayoutDto(existing), created: false, idempotent: true }
    }

    const partner = await db.affiliatePartner.findUnique({
      where: { id: partnerId },
    })
    if (!partner) throw new AffiliatePayoutError('İş ortağı bulunamadı', { status: 404 })

    const requestedIds = allocations.map((a) => a.commissionId)

    let payout: Parameters<typeof mapPayoutDto>[0] & { items: { commissionId: string; allocatedAmountKurus: number }[] }
    try {
      payout = await db.$transaction(async (tx) => {
        if (requestedIds.length) {
          await tx.$queryRaw`
            SELECT id FROM "AffiliateCommission"
            WHERE id IN (${Prisma.join(requestedIds)})
            FOR UPDATE
          `
        }

        const commissions = await tx.affiliateCommission.findMany({
          where: { id: { in: requestedIds } },
        })
        if (commissions.length !== requestedIds.length) {
          throw new AffiliatePayoutError('Bir veya daha fazla komisyon bulunamadı.', { status: 404 })
        }

        const paidMap = await getPaidAmountsByCommissionIds(requestedIds, tx)
        const byId = new Map(commissions.map((c) => [c.id, c]))
        const resolved: {
          commissionId: string
          amountKurus: number
          nextPaid: number
          commissionAmountKurus: number
          previousStatus: string
        }[] = []

        for (const entry of allocations) {
          const c = byId.get(entry.commissionId)!
          if (c.partnerId !== partnerId) {
            throw new AffiliatePayoutError('Komisyon bu iş ortağına ait değil.', {
              status: 403,
              code: 'AFFILIATE_PAYOUT_FOREIGN_COMMISSION',
            })
          }
          if (c.status === AFFILIATE_COMMISSION_STATUS.REVERSED) {
            throw new AffiliatePayoutError('İptal edilmiş komisyona ödeme yapılamaz.', {
              status: 409,
              code: 'AFFILIATE_PAYOUT_REVERSED',
            })
          }
          if (c.status === AFFILIATE_COMMISSION_STATUS.PAID) {
            throw new AffiliatePayoutError('Bu komisyon zaten tamamen ödenmiş.', {
              status: 409,
              code: 'AFFILIATE_PAYOUT_ALREADY_PAID',
            })
          }
          if (!PAYABLE_STATUSES.includes(c.status)) {
            throw new AffiliatePayoutError('Bu komisyon için ödeme yapılamaz.', {
              status: 409,
              code: 'AFFILIATE_PAYOUT_NOT_PAYABLE',
            })
          }

          const alreadyPaid = paidMap.get(c.id) ?? 0
          const remaining = c.commissionAmountKurus - alreadyPaid
          if (remaining <= 0) {
            throw new AffiliatePayoutError('Bu komisyonun kalan bakiyesi yok.', {
              status: 409,
              code: 'AFFILIATE_PAYOUT_NO_REMAINING',
            })
          }
          if (entry.amountKurus > remaining) {
            throw new AffiliatePayoutError(
              `Ödeme tutarı kalan bakiyeyi aşamaz (kalan: ${(remaining / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL).`,
              { status: 409, code: 'AFFILIATE_PAYOUT_OVER_ALLOCATION' },
            )
          }

          resolved.push({
            commissionId: c.id,
            amountKurus: entry.amountKurus,
            nextPaid: alreadyPaid + entry.amountKurus,
            commissionAmountKurus: c.commissionAmountKurus,
            previousStatus: c.status,
          })
        }

        const amountKurus = resolved.reduce((s, a) => s + a.amountKurus, 0)
        if (!Number.isInteger(amountKurus) || amountKurus <= 0) {
          throw new AffiliatePayoutError('Geçersiz ödeme tutarı.')
        }

        const created = (await tx.affiliatePayout.create({
          data: {
            partnerId,
            amountKurus,
            currency: 'TRY',
            paymentMethod: method,
            reference,
            notes,
            status: AFFILIATE_PAYOUT_STATUS.PAID,
            paidAt: paidAtDate,
            idempotencyKey: key,
            createdByAdminUserId: input.actorUserId?.trim() || null,
            items: {
              create: resolved.map((a) => ({
                commissionId: a.commissionId,
                allocatedAmountKurus: a.amountKurus,
              })),
            },
          },
          include: { items: true },
        })) as Parameters<typeof mapPayoutDto>[0] & {
          items: { commissionId: string; allocatedAmountKurus: number }[]
        }

        for (const a of resolved) {
          const nextStatus = deriveCommissionPayoutStatus(
            a.commissionAmountKurus,
            a.nextPaid,
            a.previousStatus,
          )
          const updated = await tx.affiliateCommission.updateMany({
            where: {
              id: a.commissionId,
              partnerId,
              status: { in: PAYABLE_STATUSES },
            },
            data: { status: nextStatus },
          })
          if (updated.count !== 1) {
            throw new AffiliatePayoutError('Komisyon durumu çakışması — ödeme iptal edildi.', {
              status: 409,
              code: 'AFFILIATE_PAYOUT_RACE',
            })
          }
        }

        return created
      })
    } catch (error) {
      if (error instanceof AffiliatePayoutError) throw error
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const again = (await db.affiliatePayout.findUnique({
          where: { idempotencyKey: key },
          include: { items: true },
        })) as (Parameters<typeof mapPayoutDto>[0] & { partnerId: string }) | null
        if (again && again.partnerId === partnerId) {
          return { payout: mapPayoutDto(again), created: false, idempotent: true }
        }
        throw new AffiliatePayoutError('Ödeme kaydı çakışması (tekrarlayan istek).', {
          status: 409,
          code: 'AFFILIATE_PAYOUT_CONFLICT',
        })
      }
      throw error
    }

    console.warn(
      '[audit] affiliate-payout-created',
      JSON.stringify({
        partnerId,
        payoutId: payout.id,
        amountKurus: payout.amountKurus,
        adminUserId: input.actorUserId ?? null,
        itemCount: payout.items.length,
      }),
    )

    return { payout: mapPayoutDto(payout), created: true, idempotent: false }
  },

  getPaidAmountsByCommissionIds,
}

