/** Komisyon/ödeme raporları — AffiliateCommission + AffiliatePayoutItem defterinden. */

import { prisma } from '../lib/prisma'
import { AFFILIATE_COMMISSION_STATUS } from '../lib/affiliateCommissionEvaluate'
import { withPaidRemaining } from '../lib/affiliatePayout'

export type AffiliatePartnerFinancialSummary = {
  saleCount: number
  totalGrossPaidAmountKurus: number
  totalCommissionBaseAmountKurus: number
  lifetimeEarnedCommissionKurus: number
  paidCommissionKurus: number
  pendingCommissionKurus: number
}

export type AffiliateListPagination = {
  page: number
  limit: number
  total: number
  totalPages: number
}

export type AffiliateCommissionListItem = {
  id: string
  saleType: string
  productType: string | null
  subscriptionPeriod: number | null
  productName: string
  grossPaidAmountKurus: number
  commissionBaseAmountKurus: number
  commissionRateSnapshot: number
  effectiveCustomerDiscountRateSnapshot: number
  commissionAmountKurus: number
  paidAmountKurus: number
  remainingAmountKurus: number
  status: string
  createdAt: string
  saleRef: string
  orderNo: string
}

export type AffiliatePayoutListItem = {
  id: string
  amountKurus: number
  currency: string
  paymentMethod: string
  reference: string | null
  notes: string | null
  status: string
  paidAt: string
  createdAt: string
}

export function emptyAffiliatePartnerSummary(): AffiliatePartnerFinancialSummary {
  return {
    saleCount: 0,
    totalGrossPaidAmountKurus: 0,
    totalCommissionBaseAmountKurus: 0,
    lifetimeEarnedCommissionKurus: 0,
    paidCommissionKurus: 0,
    pendingCommissionKurus: 0,
  }
}

export function emptyAffiliatePagination(page = 1, limit = 20): AffiliateListPagination {
  return { page, limit, total: 0, totalPages: 0 }
}

export function formatAffiliateKurusToTry(kurus: number | null | undefined): string {
  const n = typeof kurus === 'number' && Number.isFinite(kurus) ? kurus : 0
  const tl = n / 100
  return `${tl.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
}

async function getPaidAmountsByCommissionIds(commissionIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (const id of commissionIds) map.set(id, 0)
  if (!commissionIds.length) return map
  const rows = await prisma.affiliatePayoutItem.groupBy({
    by: ['commissionId'],
    where: { commissionId: { in: commissionIds } },
    _sum: { allocatedAmountKurus: true },
  })
  for (const row of rows) {
    map.set(row.commissionId, row._sum.allocatedAmountKurus ?? 0)
  }
  return map
}

async function sumPaidForPartner(partnerId: string): Promise<number> {
  const agg = await prisma.affiliatePayoutItem.aggregate({
    where: {
      commission: {
        partnerId,
        status: { not: AFFILIATE_COMMISSION_STATUS.REVERSED },
      },
    },
    _sum: { allocatedAmountKurus: true },
  })
  return agg._sum.allocatedAmountKurus ?? 0
}

function mapCommissionRow(
  row: {
    id: string
    saleType: string
    productType: string | null
    subscriptionPeriod: number | null
    productNameSnapshot: string
    grossPaidAmountKurus: number
    commissionBaseAmountKurus: number
    commissionRateSnapshot: number
    effectiveCustomerDiscountRateSnapshot: number
    commissionAmountKurus: number
    status: string
    createdAt: Date
    orderNo: string
  },
  paidAmountKurus: number,
): AffiliateCommissionListItem {
  const withPaid = withPaidRemaining(row, paidAmountKurus)
  return {
    id: row.id,
    saleType: row.saleType,
    productType: row.productType,
    subscriptionPeriod: row.subscriptionPeriod,
    productName: row.productNameSnapshot,
    grossPaidAmountKurus: row.grossPaidAmountKurus,
    commissionBaseAmountKurus: row.commissionBaseAmountKurus,
    commissionRateSnapshot: row.commissionRateSnapshot,
    effectiveCustomerDiscountRateSnapshot: row.effectiveCustomerDiscountRateSnapshot,
    commissionAmountKurus: row.commissionAmountKurus,
    paidAmountKurus: withPaid.paidAmountKurus,
    remainingAmountKurus: withPaid.remainingAmountKurus,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    saleRef: `SAT-${row.id.slice(-6).toUpperCase()}`,
    orderNo: row.orderNo,
  }
}

async function aggregatePartnerSummary(partnerId: string): Promise<AffiliatePartnerFinancialSummary> {
  const rows = await prisma.affiliateCommission.findMany({
    where: {
      partnerId,
      status: { not: AFFILIATE_COMMISSION_STATUS.REVERSED },
    },
    select: {
      grossPaidAmountKurus: true,
      commissionBaseAmountKurus: true,
      commissionAmountKurus: true,
    },
  })

  let totalGross = 0
  let totalBase = 0
  let lifetime = 0
  for (const r of rows) {
    totalGross += r.grossPaidAmountKurus
    totalBase += r.commissionBaseAmountKurus
    lifetime += r.commissionAmountKurus
  }
  const paidCommissionKurus = await sumPaidForPartner(partnerId)
  return {
    saleCount: rows.length,
    totalGrossPaidAmountKurus: totalGross,
    totalCommissionBaseAmountKurus: totalBase,
    lifetimeEarnedCommissionKurus: lifetime,
    paidCommissionKurus,
    pendingCommissionKurus: Math.max(0, lifetime - paidCommissionKurus),
  }
}

export const affiliateReportingService = {
  async getPartnerSummary(partnerId: string): Promise<AffiliatePartnerFinancialSummary> {
    return aggregatePartnerSummary(partnerId)
  },

  async listPartnerCommissions(
    partnerId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    summary: AffiliatePartnerFinancialSummary
    items: AffiliateCommissionListItem[]
    pagination: AffiliateListPagination
  }> {
    const safePage = Math.max(1, page)
    const safeLimit = Math.min(100, Math.max(1, limit))
    const where = { partnerId, status: { not: AFFILIATE_COMMISSION_STATUS.REVERSED } }
    const [total, rows, summary] = await Promise.all([
      prisma.affiliateCommission.count({ where }),
      prisma.affiliateCommission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      aggregatePartnerSummary(partnerId),
    ])
    const paidMap = await getPaidAmountsByCommissionIds(rows.map((r) => r.id))
    return {
      summary,
      items: rows.map((r) => mapCommissionRow(r, paidMap.get(r.id) ?? 0)),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / safeLimit),
      },
    }
  },

  async listPartnerPayouts(
    partnerId: string,
    page = 1,
    limit = 20,
    opts?: { includeNotes?: boolean },
  ): Promise<{
    items: AffiliatePayoutListItem[]
    pagination: AffiliateListPagination
  }> {
    const safePage = Math.max(1, page)
    const safeLimit = Math.min(100, Math.max(1, limit))
    const where = { partnerId }
    const [total, rows] = await Promise.all([
      prisma.affiliatePayout.count({ where }),
      prisma.affiliatePayout.findMany({
        where,
        orderBy: { paidAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
    ])
    const includeNotes = opts?.includeNotes !== false
    return {
      items: rows.map((r) => ({
        id: r.id,
        amountKurus: r.amountKurus,
        currency: r.currency,
        paymentMethod: r.paymentMethod,
        reference: r.reference,
        notes: includeNotes ? r.notes : null,
        status: r.status,
        paidAt: r.paidAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / safeLimit),
      },
    }
  },
}
