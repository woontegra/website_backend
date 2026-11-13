import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AFFILIATE_COMMISSION_STATUS } from '../lib/affiliateCommissionEvaluate'
import { deriveCommissionPayoutStatus } from '../lib/affiliatePayout'
import {
  AffiliatePayoutError,
  affiliatePayoutService,
} from './affiliatePayout.service'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')

function makeTxDb({
  commissions,
  onCreate,
  onUpdateMany,
  paidByCommission = {},
}: {
  commissions: Array<{
    id: string
    partnerId: string
    status: string
    commissionAmountKurus: number
  }>
  onCreate?: (args: { data: Record<string, unknown> }) => unknown
  onUpdateMany?: (args: { data: { status: string } }) => { count: number }
  paidByCommission?: Record<string, number>
}) {
  return {
    $queryRaw: async () => commissions.map((c) => ({ id: c.id })),
    affiliateCommission: {
      findMany: async () => commissions,
      updateMany: async (args: { data: { status: string } }) => {
        if (onUpdateMany) return onUpdateMany(args)
        return { count: 1 }
      },
    },
    affiliatePayoutItem: {
      groupBy: async () =>
        Object.entries(paidByCommission).map(([commissionId, allocated]) => ({
          commissionId,
          _sum: { allocatedAmountKurus: allocated },
        })),
    },
    affiliatePayout: {
      create: async (args: { data: Record<string, unknown> & { items?: { create: unknown[] } } }) => {
        if (onCreate) return onCreate(args)
        return {
          id: 'payout-1',
          partnerId: args.data.partnerId,
          amountKurus: args.data.amountKurus,
          currency: 'TRY',
          paymentMethod: args.data.paymentMethod,
          reference: args.data.reference ?? null,
          notes: args.data.notes ?? null,
          status: args.data.status,
          paidAt: args.data.paidAt,
          createdAt: new Date(),
          idempotencyKey: args.data.idempotencyKey,
          items: (args.data.items?.create || []).map((i: { commissionId: string; allocatedAmountKurus: number }) => ({
            commissionId: i.commissionId,
            allocatedAmountKurus: i.allocatedAmountKurus,
          })),
        }
      },
    },
  }
}

test('payout migration + schema models exist', () => {
  const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8')
  assert.match(schema, /model AffiliatePayout\b/)
  assert.match(schema, /model AffiliatePayoutItem\b/)
  assert.match(schema, /@@unique\(\[payoutId, commissionId\]\)/)
  const mig = join(root, 'prisma/migrations/20260908120000_affiliate_commission_payout/migration.sql')
  assert.equal(existsSync(mig), true)
  const sql = readFileSync(mig, 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "AffiliatePayout"/)
  assert.match(sql, /AffiliatePayoutItem_payoutId_commissionId_key/)
})

test('deriveCommissionPayoutStatus covers full/partial/reversed', () => {
  assert.equal(deriveCommissionPayoutStatus(100, 0, 'EARNED'), AFFILIATE_COMMISSION_STATUS.EARNED)
  assert.equal(
    deriveCommissionPayoutStatus(100, 40, 'EARNED'),
    AFFILIATE_COMMISSION_STATUS.PARTIALLY_PAID,
  )
  assert.equal(
    deriveCommissionPayoutStatus(100, 100, 'PARTIALLY_PAID'),
    AFFILIATE_COMMISSION_STATUS.PAID,
  )
  assert.equal(deriveCommissionPayoutStatus(100, 50, 'REVERSED'), AFFILIATE_COMMISSION_STATUS.REVERSED)
})

test('createPayout full remaining marks PAID', async () => {
  const state = { payoutAmount: 0, nextStatus: null as string | null }
  const fakeDb = {
    affiliatePayout: { findUnique: async () => null },
    affiliatePartner: { findUnique: async () => ({ id: 'p1' }) },
    $transaction: async (fn: (tx: ReturnType<typeof makeTxDb>) => Promise<unknown>) =>
      fn(
        makeTxDb({
          commissions: [
            {
              id: 'c1',
              partnerId: 'p1',
              status: 'EARNED',
              commissionAmountKurus: 200000,
            },
          ],
          onCreate: ({ data }) => {
            state.payoutAmount = data.amountKurus as number
            return {
              id: 'pay-full',
              partnerId: 'p1',
              amountKurus: data.amountKurus,
              currency: 'TRY',
              paymentMethod: data.paymentMethod,
              reference: null,
              notes: null,
              status: 'PAID',
              paidAt: data.paidAt,
              createdAt: new Date(),
              items: [{ commissionId: 'c1', allocatedAmountKurus: 200000 }],
            }
          },
          onUpdateMany: ({ data }) => {
            state.nextStatus = data.status
            return { count: 1 }
          },
        }),
      ),
  }

  const result = await affiliatePayoutService.createPayout(
    {
      partnerId: 'p1',
      allocations: [{ commissionId: 'c1', amountKurus: 200000 }],
      paymentMethod: 'BANK_TRANSFER',
      idempotencyKey: 'idem-happy-01',
    },
    { db: fakeDb as never },
  )
  assert.equal(result.created, true)
  assert.equal(state.payoutAmount, 200000)
  assert.equal(state.nextStatus, 'PAID')
})

test('partial allocation → PARTIALLY_PAID; over-allocation rejected', async () => {
  const state = { amount: 0, status: null as string | null }
  const fakeDb = {
    affiliatePayout: { findUnique: async () => null },
    affiliatePartner: { findUnique: async () => ({ id: 'p1' }) },
    $transaction: async (fn: (tx: ReturnType<typeof makeTxDb>) => Promise<unknown>) =>
      fn(
        makeTxDb({
          commissions: [
            {
              id: 'c1',
              partnerId: 'p1',
              status: 'EARNED',
              commissionAmountKurus: 10000000,
            },
          ],
          onCreate: ({ data }) => {
            state.amount = data.amountKurus as number
            return {
              id: 'pay-partial',
              partnerId: 'p1',
              amountKurus: data.amountKurus,
              currency: 'TRY',
              paymentMethod: data.paymentMethod,
              reference: null,
              notes: null,
              status: 'PAID',
              paidAt: data.paidAt,
              createdAt: new Date(),
              items: (data.items as { create: unknown[] }).create,
            }
          },
          onUpdateMany: ({ data }) => {
            state.status = data.status
            return { count: 1 }
          },
        }),
      ),
  }

  const partial = await affiliatePayoutService.createPayout(
    {
      partnerId: 'p1',
      allocations: [{ commissionId: 'c1', amountKurus: 5000000 }],
      paymentMethod: 'BANK_TRANSFER',
      idempotencyKey: 'idem-partial-01',
    },
    { db: fakeDb as never },
  )
  assert.equal(partial.created, true)
  assert.equal(state.amount, 5000000)
  assert.equal(state.status, 'PARTIALLY_PAID')

  const overDb = {
    affiliatePayout: { findUnique: async () => null },
    affiliatePartner: { findUnique: async () => ({ id: 'p1' }) },
    $transaction: async (fn: (tx: ReturnType<typeof makeTxDb>) => Promise<unknown>) =>
      fn(
        makeTxDb({
          commissions: [
            {
              id: 'c1',
              partnerId: 'p1',
              status: 'PARTIALLY_PAID',
              commissionAmountKurus: 10000000,
            },
          ],
          paidByCommission: { c1: 5000000 },
        }),
      ),
  }

  await assert.rejects(
    () =>
      affiliatePayoutService.createPayout(
        {
          partnerId: 'p1',
          allocations: [{ commissionId: 'c1', amountKurus: 6000000 }],
          paymentMethod: 'CASH',
          idempotencyKey: 'idem-over-01',
        },
        { db: overDb as never },
      ),
    (e: unknown) => e instanceof AffiliatePayoutError && e.code === 'AFFILIATE_PAYOUT_OVER_ALLOCATION',
  )
})

test('idempotent replay returns existing payout without double create', async () => {
  const existing = {
    id: 'p1',
    partnerId: 'partner-1',
    amountKurus: 200000,
    currency: 'TRY',
    paymentMethod: 'CASH',
    reference: null,
    notes: null,
    status: 'PAID',
    paidAt: new Date(),
    createdAt: new Date(),
    idempotencyKey: 'idem-replay-01',
    items: [],
  }
  const fakeDb = {
    affiliatePayout: {
      findUnique: async () => existing,
    },
  }
  const result = await affiliatePayoutService.createPayout(
    {
      partnerId: 'partner-1',
      allocations: [{ commissionId: 'c1', amountKurus: 200000 }],
      paymentMethod: 'CASH',
      idempotencyKey: 'idem-replay-01',
    },
    { db: fakeDb as never },
  )
  assert.equal(result.idempotent, true)
  assert.equal(result.created, false)
  assert.equal(result.payout.id, 'p1')
})

test('multi-commission allocation distributes in one payout', async () => {
  const state = {
    amount: 0,
    itemCount: 0,
    statuses: [] as string[],
  }
  const fakeDb = {
    affiliatePayout: { findUnique: async () => null },
    affiliatePartner: { findUnique: async () => ({ id: 'p1' }) },
    $transaction: async (fn: (tx: ReturnType<typeof makeTxDb>) => Promise<unknown>) =>
      fn(
        makeTxDb({
          commissions: [
            { id: 'c1', partnerId: 'p1', status: 'EARNED', commissionAmountKurus: 100000 },
            { id: 'c2', partnerId: 'p1', status: 'EARNED', commissionAmountKurus: 250000 },
          ],
          onCreate: ({ data }) => {
            state.amount = data.amountKurus as number
            const items = (data.items as { create: { commissionId: string; allocatedAmountKurus: number }[] })
              .create
            state.itemCount = items.length
            return {
              id: 'pay-multi',
              partnerId: 'p1',
              amountKurus: data.amountKurus,
              currency: 'TRY',
              paymentMethod: data.paymentMethod,
              reference: null,
              notes: null,
              status: 'PAID',
              paidAt: data.paidAt,
              createdAt: new Date(),
              items,
            }
          },
          onUpdateMany: ({ data }) => {
            state.statuses.push(data.status)
            return { count: 1 }
          },
        }),
      ),
  }

  const result = await affiliatePayoutService.createPayout(
    {
      partnerId: 'p1',
      allocations: [
        { commissionId: 'c1', amountKurus: 100000 },
        { commissionId: 'c2', amountKurus: 100000 },
      ],
      paymentMethod: 'OTHER',
      notes: 'Toplu ödeme',
      idempotencyKey: 'idem-multi-01',
    },
    { db: fakeDb as never },
  )
  assert.equal(result.created, true)
  assert.equal(state.amount, 200000)
  assert.equal(state.itemCount, 2)
  assert.deepEqual(state.statuses, ['PAID', 'PARTIALLY_PAID'])
  assert.equal(result.payout.items.length, 2)
})

test('zero or negative allocation rejected', async () => {
  await assert.rejects(
    () =>
      affiliatePayoutService.createPayout({
        partnerId: 'p1',
        allocations: [{ commissionId: 'c1', amountKurus: 0 }],
        paymentMethod: 'BANK_TRANSFER',
        idempotencyKey: 'idem-zero-01',
      }),
    (e: unknown) =>
      e instanceof AffiliatePayoutError && e.code === 'AFFILIATE_PAYOUT_INVALID_ALLOCATION',
  )
})
