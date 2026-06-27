import { ProductType } from '@prisma/client'

export type CampaignType = 'announcement' | 'banner' | 'product_discount' | 'coupon'
export type DiscountType = 'percent' | 'fixed_amount' | 'fixed_price'
export type TargetType = 'all' | 'products' | 'categories' | 'product_types'
export type ProductTargetType = 'DOWNLOAD' | 'SAAS' | 'SERVICE' | 'FREE_DOWNLOAD'

export type CampaignRecord = {
  id: string
  slug: string
  name: string
  type: CampaignType
  active: boolean
  priority: number
  shortTitle?: string
  description?: string
  badge?: string
  ctaText?: string
  ctaLink?: string
  discountType?: DiscountType
  discountValue?: number
  minCartTotal?: number | null
  maxDiscountAmount?: number | null
  freeProductEnabled?: boolean
  stackPriority?: 'highest' | 'lowest'
  targetType?: TargetType
  targetProductIds?: string[]
  targetCategoryIds?: string[]
  targetProductTypes?: ProductTargetType[]
  excludeProductIds?: string[]
  desktopImage?: string
  mobileImage?: string
  backgroundColor?: string
  gradient?: string
  textColor?: string
  overlay?: string
  startAt?: string | null
  endAt?: string | null
  couponCode?: string
  couponUsageLimit?: number | null
  couponUsagePerCustomer?: number | null
  couponFirstPurchaseOnly?: boolean
  couponProductScopeOnly?: boolean
  adminNote?: string
  showOnPublic?: boolean
  createdAt?: string
  updatedAt?: string
}

export type ProductPricingContext = {
  id: string
  categoryId: string | null
  productType: ProductType
  price: number
  purchaseEnabled: boolean
}

export type AppliedCampaignPricing = {
  effectivePrice: number
  originalPrice: number
  campaignId: string
  campaignName: string
  badge: string | null
  endsAt: string | null
  discountAmount: number
}

export type CampaignScheduleStatus = 'active' | 'inactive' | 'scheduled' | 'expired'

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCampaignType(value: unknown): value is CampaignType {
  return value === 'announcement' || value === 'banner' || value === 'product_discount' || value === 'coupon'
}

export function normalizeCampaign(raw: unknown): CampaignRecord | null {
  if (!isRecord(raw)) return null
  const id = String(raw.id ?? '').trim()
  const name = String(raw.name ?? '').trim()
  const slug = String(raw.slug ?? '').trim()
  const type = raw.type
  if (!id || !name || !slug || !isCampaignType(type)) return null

  return {
    id,
    slug,
    name,
    type,
    active: raw.active !== false,
    priority: toNumber(raw.priority, 0),
    shortTitle: raw.shortTitle != null ? String(raw.shortTitle) : undefined,
    description: raw.description != null ? String(raw.description) : undefined,
    badge: raw.badge != null ? String(raw.badge) : undefined,
    ctaText: raw.ctaText != null ? String(raw.ctaText) : undefined,
    ctaLink: raw.ctaLink != null ? String(raw.ctaLink) : undefined,
    discountType:
      raw.discountType === 'percent' || raw.discountType === 'fixed_amount' || raw.discountType === 'fixed_price'
        ? raw.discountType
        : undefined,
    discountValue: raw.discountValue != null ? toNumber(raw.discountValue) : undefined,
    minCartTotal: raw.minCartTotal != null ? toNumber(raw.minCartTotal) : null,
    maxDiscountAmount: raw.maxDiscountAmount != null ? toNumber(raw.maxDiscountAmount) : null,
    freeProductEnabled: raw.freeProductEnabled === true,
    stackPriority: raw.stackPriority === 'lowest' ? 'lowest' : 'highest',
    targetType:
      raw.targetType === 'products' ||
      raw.targetType === 'categories' ||
      raw.targetType === 'product_types' ||
      raw.targetType === 'all'
        ? raw.targetType
        : 'all',
    targetProductIds: Array.isArray(raw.targetProductIds)
      ? raw.targetProductIds.map((x) => String(x).trim()).filter(Boolean)
      : [],
    targetCategoryIds: Array.isArray(raw.targetCategoryIds)
      ? raw.targetCategoryIds.map((x) => String(x).trim()).filter(Boolean)
      : [],
    targetProductTypes: Array.isArray(raw.targetProductTypes)
      ? (raw.targetProductTypes.filter(
          (x) => x === 'DOWNLOAD' || x === 'SAAS' || x === 'SERVICE' || x === 'FREE_DOWNLOAD',
        ) as ProductTargetType[])
      : [],
    excludeProductIds: Array.isArray(raw.excludeProductIds)
      ? raw.excludeProductIds.map((x) => String(x).trim()).filter(Boolean)
      : [],
    desktopImage: raw.desktopImage != null ? String(raw.desktopImage) : undefined,
    mobileImage: raw.mobileImage != null ? String(raw.mobileImage) : undefined,
    backgroundColor: raw.backgroundColor != null ? String(raw.backgroundColor) : undefined,
    gradient: raw.gradient != null ? String(raw.gradient) : undefined,
    textColor: raw.textColor != null ? String(raw.textColor) : undefined,
    overlay: raw.overlay != null ? String(raw.overlay) : undefined,
    startAt: raw.startAt != null ? String(raw.startAt) : null,
    endAt: raw.endAt != null ? String(raw.endAt) : null,
    couponCode: raw.couponCode != null ? String(raw.couponCode).trim().toUpperCase() : undefined,
    couponUsageLimit: raw.couponUsageLimit != null ? toNumber(raw.couponUsageLimit) : null,
    couponUsagePerCustomer: raw.couponUsagePerCustomer != null ? toNumber(raw.couponUsagePerCustomer) : null,
    couponFirstPurchaseOnly: raw.couponFirstPurchaseOnly === true,
    couponProductScopeOnly: raw.couponProductScopeOnly === true,
    adminNote: raw.adminNote != null ? String(raw.adminNote) : undefined,
    showOnPublic: raw.showOnPublic !== false,
    createdAt: raw.createdAt != null ? String(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : undefined,
  }
}

export function parseCampaignsJson(raw: unknown): CampaignRecord[] {
  try {
    if (raw == null || raw === '') return []
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeCampaign).filter((c): c is CampaignRecord => c != null)
    }
    if (isRecord(parsed) && Array.isArray(parsed.campaigns)) {
      return parsed.campaigns.map(normalizeCampaign).filter((c): c is CampaignRecord => c != null)
    }
    return []
  } catch {
    return []
  }
}

export function serializeCampaignsJson(campaigns: CampaignRecord[]): string {
  return JSON.stringify({ version: 1, campaigns })
}

export function getCampaignScheduleStatus(campaign: CampaignRecord, now = new Date()): CampaignScheduleStatus {
  if (!campaign.active) return 'inactive'
  const ts = now.getTime()
  if (campaign.startAt) {
    const start = new Date(campaign.startAt).getTime()
    if (!Number.isNaN(start) && start > ts) return 'scheduled'
  }
  if (campaign.endAt) {
    const end = new Date(campaign.endAt).getTime()
    if (!Number.isNaN(end) && end < ts) return 'expired'
  }
  return 'active'
}

export function isCampaignLive(campaign: CampaignRecord, now = new Date()): boolean {
  return getCampaignScheduleStatus(campaign, now) === 'active'
}

function matchesProductTypeTarget(target: ProductTargetType, product: ProductPricingContext): boolean {
  if (target === 'SAAS') return product.productType === ProductType.SAAS
  if (target === 'SERVICE') return product.productType === ProductType.SERVICE
  if (target === 'FREE_DOWNLOAD') {
    return product.productType === ProductType.DOWNLOAD && !product.purchaseEnabled && product.price <= 0
  }
  return product.productType === ProductType.DOWNLOAD && product.purchaseEnabled && product.price > 0
}

export function productMatchesCampaignTarget(campaign: CampaignRecord, product: ProductPricingContext): boolean {
  if ((campaign.excludeProductIds ?? []).includes(product.id)) return false
  const targetType = campaign.targetType ?? 'all'
  if (targetType === 'all') return true
  if (targetType === 'products') {
    return (campaign.targetProductIds ?? []).includes(product.id)
  }
  if (targetType === 'categories') {
    if (!product.categoryId) return false
    return (campaign.targetCategoryIds ?? []).includes(product.categoryId)
  }
  if (targetType === 'product_types') {
    const types = campaign.targetProductTypes ?? []
    if (types.length === 0) return false
    return types.some((t) => matchesProductTypeTarget(t, product))
  }
  return false
}

export function computeDiscountedUnitPrice(basePrice: number, campaign: CampaignRecord): number {
  if (basePrice <= 0) return basePrice
  const discountType = campaign.discountType ?? 'percent'
  const discountValue = toNumber(campaign.discountValue, 0)

  if (discountType === 'percent') {
    const pct = Math.min(100, Math.max(1, discountValue))
    let discounted = basePrice * (1 - pct / 100)
    const maxDiscount = campaign.maxDiscountAmount
    if (maxDiscount != null && maxDiscount > 0) {
      discounted = Math.max(basePrice - maxDiscount, discounted)
    }
    return roundMoney(Math.max(0, discounted))
  }

  if (discountType === 'fixed_amount') {
    const amount = Math.min(basePrice, Math.max(0, discountValue))
    return roundMoney(Math.max(0, basePrice - amount))
  }

  if (discountType === 'fixed_price') {
    return roundMoney(Math.max(0, discountValue))
  }

  return roundMoney(basePrice)
}

export function validateCampaignDiscount(campaign: CampaignRecord, sampleBasePrice = 1000): string | null {
  if (campaign.type !== 'product_discount' && campaign.type !== 'coupon') return null
  const discountType = campaign.discountType ?? 'percent'
  const discountValue = toNumber(campaign.discountValue, -1)

  if (discountType === 'percent') {
    if (discountValue < 1 || discountValue > 100) return 'Yüzde indirim 1–100 arası olmalıdır'
  } else if (discountType === 'fixed_amount') {
    if (discountValue < 0) return 'Sabit indirim negatif olamaz'
    if (discountValue > sampleBasePrice) return 'Sabit indirim örnek fiyattan büyük olamaz'
  } else if (discountType === 'fixed_price') {
    if (discountValue < 0) return 'Kampanya fiyatı negatif olamaz'
  }

  const result = computeDiscountedUnitPrice(Math.max(sampleBasePrice, 1), campaign)
  if (result < 0) return 'İndirimli fiyat negatif olamaz'
  return null
}

export function resolveProductCampaignPrice(
  product: ProductPricingContext,
  campaigns: CampaignRecord[],
  now = new Date(),
): AppliedCampaignPricing | null {
  if (product.price <= 0 || !product.purchaseEnabled) return null

  const eligible = campaigns
    .filter((c) => c.type === 'product_discount' && isCampaignLive(c, now))
    .filter((c) => productMatchesCampaignTarget(c, product))
    .sort((a, b) => {
      const prioDiff = (b.priority ?? 0) - (a.priority ?? 0)
      if (prioDiff !== 0) return prioDiff
      if (a.stackPriority === 'lowest' && b.stackPriority !== 'lowest') return 1
      if (b.stackPriority === 'lowest' && a.stackPriority !== 'lowest') return -1
      return 0
    })

  const winner = eligible[0]
  if (!winner) return null

  const effectivePrice = computeDiscountedUnitPrice(product.price, winner)
  if (effectivePrice >= product.price) return null

  return {
    effectivePrice,
    originalPrice: product.price,
    campaignId: winner.id,
    campaignName: winner.name,
    badge: winner.badge?.trim() || null,
    endsAt: winner.endAt ?? null,
    discountAmount: roundMoney(product.price - effectivePrice),
  }
}

export type PublicCampaignBrief = {
  id: string
  slug: string
  name: string
  type: CampaignType
  shortTitle?: string
  description?: string
  badge?: string
  ctaText?: string
  ctaLink?: string
  desktopImage?: string
  mobileImage?: string
  backgroundColor?: string
  gradient?: string
  textColor?: string
  overlay?: string
  endAt?: string | null
}

export function toPublicCampaignBrief(campaign: CampaignRecord): PublicCampaignBrief {
  return {
    id: campaign.id,
    slug: campaign.slug,
    name: campaign.name,
    type: campaign.type,
    shortTitle: campaign.shortTitle,
    description: campaign.description,
    badge: campaign.badge,
    ctaText: campaign.ctaText,
    ctaLink: campaign.ctaLink,
    desktopImage: campaign.desktopImage,
    mobileImage: campaign.mobileImage,
    backgroundColor: campaign.backgroundColor,
    gradient: campaign.gradient,
    textColor: campaign.textColor,
    overlay: campaign.overlay,
    endAt: campaign.endAt ?? null,
  }
}
