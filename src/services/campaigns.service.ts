import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { slugifyName } from '../utils/slugify'
import {
  type AppliedCampaignPricing,
  type CampaignRecord,
  type CampaignScheduleStatus,
  type CampaignType,
  type ProductPricingContext,
  type PublicCampaignBrief,
  getCampaignScheduleStatus,
  isCampaignLive,
  normalizeCampaign,
  parseCampaignsJson,
  resolveProductCampaignPrice,
  serializeCampaignsJson,
  toPublicCampaignBrief,
  validateCampaignDiscount,
} from '../lib/campaignPricing'

const CAMPAIGNS_SETTING_KEY = 'campaigns_json'

let cache: { campaigns: CampaignRecord[]; loadedAt: number } | null = null
const CACHE_TTL_MS = 3000

async function loadAllCampaigns(force = false): Promise<CampaignRecord[]> {
  const now = Date.now()
  if (!force && cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.campaigns
  }
  const row = await prisma.siteSetting.findUnique({ where: { key: CAMPAIGNS_SETTING_KEY } })
  const campaigns = parseCampaignsJson(row?.value ?? null)
  cache = { campaigns, loadedAt: now }
  return campaigns
}

async function persistCampaigns(campaigns: CampaignRecord[]): Promise<void> {
  cache = { campaigns, loadedAt: Date.now() }
  await prisma.siteSetting.upsert({
    where: { key: CAMPAIGNS_SETTING_KEY },
    create: { key: CAMPAIGNS_SETTING_KEY, value: serializeCampaignsJson(campaigns) },
    update: { value: serializeCampaignsJson(campaigns) },
  })
}

export type AdminCampaignListQuery = {
  search?: string
  type?: CampaignType
  active?: 'true' | 'false'
  schedule?: 'scheduled' | 'expired' | 'product_discount' | 'coupon'
}

function campaignMatchesQuery(campaign: CampaignRecord, q: AdminCampaignListQuery, now: Date): boolean {
  if (q.search) {
    const needle = q.search.toLowerCase()
    const hay = `${campaign.name} ${campaign.slug} ${campaign.shortTitle ?? ''} ${campaign.couponCode ?? ''}`.toLowerCase()
    if (!hay.includes(needle)) return false
  }
  if (q.type && campaign.type !== q.type) return false
  if (q.active === 'true' && !campaign.active) return false
  if (q.active === 'false' && campaign.active) return false
  if (q.schedule === 'scheduled' && getCampaignScheduleStatus(campaign, now) !== 'scheduled') return false
  if (q.schedule === 'expired' && getCampaignScheduleStatus(campaign, now) !== 'expired') return false
  if (q.schedule === 'product_discount' && campaign.type !== 'product_discount') return false
  if (q.schedule === 'coupon' && campaign.type !== 'coupon') return false
  return true
}

function withComputedStatus(campaign: CampaignRecord, now = new Date()) {
  const scheduleStatus: CampaignScheduleStatus = getCampaignScheduleStatus(campaign, now)
  return {
    ...campaign,
    scheduleStatus,
    isLive: scheduleStatus === 'active',
  }
}

function ensureUniqueSlug(base: string, campaigns: CampaignRecord[], excludeId?: string): string {
  let slug = base
  let i = 2
  while (campaigns.some((c) => c.slug === slug && c.id !== excludeId)) {
    slug = `${base}-${i}`
    i += 1
  }
  return slug
}

export const campaignsService = {
  async listAdmin(query: AdminCampaignListQuery = {}) {
    const campaigns = await loadAllCampaigns()
    const now = new Date()
    return campaigns
      .filter((c) => campaignMatchesQuery(c, query, now))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.name.localeCompare(b.name, 'tr'))
      .map((c) => withComputedStatus(c, now))
  },

  async getById(id: string) {
    const campaigns = await loadAllCampaigns()
    const found = campaigns.find((c) => c.id === id)
    return found ? withComputedStatus(found) : null
  },

  async create(input: Partial<CampaignRecord>) {
    const campaigns = await loadAllCampaigns(true)
    const name = String(input.name ?? '').trim()
    if (name.length < 2) {
      const err = new Error('Kampanya adı en az 2 karakter olmalıdır') as Error & { status: number }
      err.status = 400
      throw err
    }
    const type = input.type
    if (type !== 'announcement' && type !== 'banner' && type !== 'product_discount' && type !== 'coupon') {
      const err = new Error('Geçersiz kampanya tipi') as Error & { status: number }
      err.status = 400
      throw err
    }
    const rawSlug = String(input.slug ?? '').trim() || slugifyName(name)
    const slug = ensureUniqueSlug(rawSlug, campaigns)
    const discountErr = validateCampaignDiscount({ ...input, type, slug, name, id: 'x', active: true, priority: 0 } as CampaignRecord)
    if (discountErr) {
      const err = new Error(discountErr) as Error & { status: number }
      err.status = 400
      throw err
    }

    const nowIso = new Date().toISOString()
    const record: CampaignRecord = normalizeCampaign({
      ...input,
      id: randomUUID(),
      name,
      slug,
      type,
      active: input.active !== false,
      priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    })!

    campaigns.push(record)
    await persistCampaigns(campaigns)
    return withComputedStatus(record)
  },

  async update(id: string, patch: Partial<CampaignRecord>) {
    const campaigns = await loadAllCampaigns(true)
    const idx = campaigns.findIndex((c) => c.id === id)
    if (idx < 0) {
      const err = new Error('Kampanya bulunamadı') as Error & { status: number }
      err.status = 404
      throw err
    }
    const current = campaigns[idx]
    const nextName = patch.name != null ? String(patch.name).trim() : current.name
    if (nextName.length < 2) {
      const err = new Error('Kampanya adı en az 2 karakter olmalıdır') as Error & { status: number }
      err.status = 400
      throw err
    }
    let nextSlug = patch.slug != null ? String(patch.slug).trim() : current.slug
    if (!nextSlug) nextSlug = slugifyName(nextName)
    nextSlug = ensureUniqueSlug(nextSlug, campaigns, id)

    const merged = normalizeCampaign({
      ...current,
      ...patch,
      id: current.id,
      name: nextName,
      slug: nextSlug,
      updatedAt: new Date().toISOString(),
    })
    if (!merged) {
      const err = new Error('Geçersiz kampanya verisi') as Error & { status: number }
      err.status = 400
      throw err
    }
    const discountErr = validateCampaignDiscount(merged)
    if (discountErr) {
      const err = new Error(discountErr) as Error & { status: number }
      err.status = 400
      throw err
    }

    campaigns[idx] = merged
    await persistCampaigns(campaigns)
    return withComputedStatus(merged)
  },

  async remove(id: string): Promise<void> {
    const campaigns = await loadAllCampaigns(true)
    const next = campaigns.filter((c) => c.id !== id)
    if (next.length === campaigns.length) {
      const err = new Error('Kampanya bulunamadı') as Error & { status: number }
      err.status = 404
      throw err
    }
    await persistCampaigns(next)
  },

  /** Ürün fiyatlandırma ve public API için ham kampanya listesi */
  async getActiveCampaigns(force = false): Promise<CampaignRecord[]> {
    return loadAllCampaigns(force)
  },

  async resolveProductUnitPrice(
    product: ProductPricingContext,
  ): Promise<{ unitPrice: number; pricing: AppliedCampaignPricing | null }> {
    const campaigns = await loadAllCampaigns()
    const pricing = resolveProductCampaignPrice(product, campaigns)
    return {
      unitPrice: pricing?.effectivePrice ?? product.price,
      pricing,
    }
  },

  async getPublicPayload(): Promise<{
    announcement: PublicCampaignBrief | null
    banners: PublicCampaignBrief[]
  }> {
    const campaigns = await loadAllCampaigns()
    const now = new Date()
    const visible = campaigns.filter((c) => c.showOnPublic !== false && isCampaignLive(c, now))

    const announcement = visible
      .filter((c) => c.type === 'announcement')
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0]

    const banners = visible
      .filter((c) => c.type === 'banner')
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .map(toPublicCampaignBrief)

    return {
      announcement: announcement ? toPublicCampaignBrief(announcement) : null,
      banners,
    }
  },
}
