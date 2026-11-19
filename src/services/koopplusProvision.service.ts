import { prisma } from '../lib/prisma'
import {
  extractKoopPlusError,
  isKoopPlusIntegrationConfigured,
  postKoopPlusJson,
  type KoopPlusResponse,
} from '../lib/koopplusIntegration'
import {
  buildKoopPlusOrderPayload,
  isRetryableKoopPlusStatus,
  sanitizeKoopPlusError,
} from '../lib/koopplusOrderPayload'
import { isKoopPlusProduct, normalizeKoopPlusLicenseKey } from '../lib/koopplusProduct'

/** Deneme gecikmeleri (ms): 0s, 2s, 8s. Kalan denemeler admin "retry-delivery" ile yapılır. */
export const KOOPPLUS_RETRY_DELAYS_MS = [0, 2_000, 8_000] as const

export type KoopPlusProvisionError = {
  orderItemId: string
  productName: string
  error: string
}

export type KoopPlusProvisionSuccess = {
  orderItemId: string
  productName: string
  licenseKey?: string
  action?: 'created' | 'converted' | 'renewed'
  /** true: bu çağrıda KoopPlus'a gönderilmedi (daha önce bildirilmişti) */
  alreadyNotified: boolean
}

export type KoopPlusProvisionResult = {
  errors: KoopPlusProvisionError[]
  provisioned: KoopPlusProvisionSuccess[]
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type OrderItemSlugRow = { productSlug: string | null; product: { slug: string | null } | null }

export function isKoopPlusOrderItem(item: OrderItemSlugRow): boolean {
  return isKoopPlusProduct({ productSlug: item.productSlug, product: item.product })
}

/** KoopPlus entegrasyonu üzerinden sağlanan satırlar masaüstü merkezi lisans akışından hariç tutulur. */
export function isKoopPlusExcludedFromExternalLicense(item: OrderItemSlugRow): boolean {
  return isKoopPlusOrderItem(item)
}

export type KoopPlusCallOptions = {
  post?: (path: string, body: unknown) => Promise<KoopPlusResponse>
  sleepFn?: (ms: number) => Promise<void>
  delaysMs?: readonly number[]
}

/** Üstel geri çekilmeyle (0s, 2s, 8s) KoopPlus sipariş bildirimi. */
export async function callKoopPlusOrderWithRetry(
  payload: unknown,
  opts: KoopPlusCallOptions = {},
): Promise<KoopPlusResponse & { attempts: number }> {
  const post = opts.post ?? postKoopPlusJson
  const wait = opts.sleepFn ?? sleep
  const delays = opts.delaysMs ?? KOOPPLUS_RETRY_DELAYS_MS
  let last: KoopPlusResponse = { ok: false, status: 0, json: null }
  let attempts = 0
  for (const delay of delays) {
    if (delay > 0) await wait(delay)
    attempts += 1
    last = await post('/api/integrations/orders', payload)
    if (last.ok) break
    if (!isRetryableKoopPlusStatus(last.status)) break
  }
  return { ...last, attempts }
}

function readSuccessData(json: unknown): { licenseKey?: string; action?: KoopPlusProvisionSuccess['action'] } {
  if (!json || typeof json !== 'object') return {}
  const data = (json as { data?: unknown }).data
  if (!data || typeof data !== 'object') return {}
  const d = data as { licenseKey?: unknown; action?: unknown }
  const licenseKey = typeof d.licenseKey === 'string' && d.licenseKey.trim() ? d.licenseKey.trim() : undefined
  const action =
    d.action === 'created' || d.action === 'converted' || d.action === 'renewed' ? d.action : undefined
  return { licenseKey, action }
}

/**
 * Ödenmiş siparişteki KoopPlus ürünleri için KoopPlus SaaS'a (POST /api/integrations/orders) bildirir.
 * - Idempotent: KoopPlus tarafında orderId=order.orderNo; ayrıca satırda licenseServerUnitsNotified>0 ise atlanır.
 * - Hata: licenseServerLastError (PII/anahtar içermez) + errors dizisi.
 */
export async function ensureKoopPlusOrders(
  orderId: string,
  opts: KoopPlusCallOptions = {},
): Promise<KoopPlusProvisionResult> {
  const errors: KoopPlusProvisionError[] = []
  const provisioned: KoopPlusProvisionSuccess[] = []

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          productName: true,
          productSlug: true,
          total: true,
          quantity: true,
          licenseServerUnitsNotified: true,
          licenseServerLicenseKey: true,
          product: { select: { slug: true } },
        },
      },
    },
  })
  if (!order) return { errors, provisioned }
  if (order.status !== 'PAID' && order.status !== 'PROCESSING') return { errors, provisioned }
  // Masaüstü lisans yenileme bağlamı kendi akışında (lisans sunucusu) işlenir.
  if (order.desktopLicensePurchaseContext === 'DESKTOP_LICENSE_RENEWAL') return { errors, provisioned }

  const koopItems = order.items.filter((i) => isKoopPlusOrderItem(i))
  if (koopItems.length === 0) return { errors, provisioned }

  const pending = koopItems.filter((i) => (i.licenseServerUnitsNotified ?? 0) <= 0)
  for (const item of koopItems) {
    if ((item.licenseServerUnitsNotified ?? 0) > 0) {
      provisioned.push({
        orderItemId: item.id,
        productName: item.productName,
        licenseKey: item.licenseServerLicenseKey?.trim() || undefined,
        alreadyNotified: true,
      })
    }
  }
  if (pending.length === 0) return { errors, provisioned }

  const failAll = async (error: string) => {
    for (const item of pending) {
      errors.push({ orderItemId: item.id, productName: item.productName, error })
    }
    await prisma.orderItem.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { licenseServerLastError: error },
    })
    // PII yok: yalnızca sipariş no ve durum
    console.error('[koopplus] order provision failed', { orderNo: order.orderNo, error })
  }

  if (!opts.post && !isKoopPlusIntegrationConfigured()) {
    await failAll('KoopPlus entegrasyonu yapılandırılmamış (INTEGRATION_SECRET).')
    return { errors, provisioned }
  }

  const renewalKey =
    pending.map((i) => normalizeKoopPlusLicenseKey(i.licenseServerLicenseKey)).find(Boolean) ??
    normalizeKoopPlusLicenseKey(order.koopplusLicenseKey)

  const allKoop = koopItems.length === order.items.length
  const amount = allKoop
    ? Number(order.total)
    : koopItems.reduce((sum, i) => sum + Number(i.total), 0)

  const quantity = koopItems.reduce((sum, i) => sum + Math.max(1, Number(i.quantity) || 1), 0)
  const payload = buildKoopPlusOrderPayload({ order, amount, licenseKey: renewalKey, quantity })
  const res = await callKoopPlusOrderWithRetry(payload, opts)

  const body = res.json as { success?: unknown } | null
  if (!res.ok || !body || body.success !== true) {
    await failAll(sanitizeKoopPlusError(extractKoopPlusError(res.json), res.status))
    return { errors, provisioned }
  }

  const { licenseKey, action } = readSuccessData(res.json)
  const now = new Date()
  for (const item of pending) {
    await prisma.orderItem.update({
      where: { id: item.id },
      data: {
        licenseServerUnitsNotified: 1,
        licenseServerLastError: null,
        licenseServerLastNotifiedAt: now,
        ...(licenseKey && !item.licenseServerLicenseKey?.trim() ? { licenseServerLicenseKey: licenseKey } : {}),
      },
    })
    provisioned.push({
      orderItemId: item.id,
      productName: item.productName,
      licenseKey,
      action,
      alreadyNotified: false,
    })
  }
  console.info('[koopplus] order provision ok', { orderNo: order.orderNo, action: action ?? null })
  return { errors, provisioned }
}

export type KoopPlusSyncStatus = {
  status: 'sent' | 'error' | 'pending'
  label: 'Gönderildi' | 'Hata' | 'Bekliyor'
  lastError: string | null
  lastNotifiedAt: string | null
}

/** Admin sipariş detayı: lisans sunucusu hata/units alanlarından KoopPlus senkron durumu. */
export function deriveKoopPlusSyncStatus(
  items: {
    productSlug: string | null
    product: { slug: string | null } | null
    licenseServerLastError: string | null
    licenseServerUnitsNotified: number | null
    licenseServerLastNotifiedAt: Date | null
  }[],
): KoopPlusSyncStatus | null {
  const koop = items.filter((i) => isKoopPlusOrderItem(i))
  if (koop.length === 0) return null
  const failed = koop.find((i) => i.licenseServerLastError?.trim())
  if (failed) {
    return {
      status: 'error',
      label: 'Hata',
      lastError: failed.licenseServerLastError!.trim(),
      lastNotifiedAt: null,
    }
  }
  if (koop.every((i) => (i.licenseServerUnitsNotified ?? 0) > 0)) {
    const last = koop
      .map((i) => i.licenseServerLastNotifiedAt)
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => b.getTime() - a.getTime())[0]
    return { status: 'sent', label: 'Gönderildi', lastError: null, lastNotifiedAt: last?.toISOString() ?? null }
  }
  return { status: 'pending', label: 'Bekliyor', lastError: null, lastNotifiedAt: null }
}
