import type { Request, Response } from 'express'
import { bhManualCallback, bhUpstreamFetch } from '../services/bhWebapi.client'
import { resolveBhWebapiBaseUrl } from '../lib/assertSafeBhUpstream'
import { sanitizeBhCheckoutBilling } from '../lib/sanitizeBhCheckoutBilling'
import {
  buildBhAffiliateBridgeHeaders,
  recordBhAffiliateCommissionForPaidSale,
  resolveBhAffiliateFromRequest,
} from '../services/bhAffiliate.service'
import { buildWoontegraBhSalesChannelHeaders } from '../lib/bhSalesChannel'
import { createBhCentralCheckoutOrder } from '../services/bhCentralCheckout.service'

function sendUpstream(res: Response, result: Awaited<ReturnType<typeof bhUpstreamFetch>>) {
  if (result.ok) {
    return res.status(result.status).json(result.data ?? { success: true })
  }
  const payload =
    result.data && typeof result.data === 'object'
      ? result.data
      : { success: false, message: result.error }
  return res.status(result.status || 502).json(payload)
}

/**
 * Authenticated Woontegra customer → BH payment body.
 * - Forces billing email from JWT
 * - Sanitizes billing (TCKN/VKN format); never puts them into customerNote
 * - Stores stable user id on BH Payment.customerNote
 */
function attachWoontegraCustomerToBhBody(req: Request, body: Record<string, unknown>) {
  const customer = req.customer
  if (!customer?.id || !customer.email) {
    return { ok: false as const, status: 401, message: 'Satın alma için Woontegra hesabına giriş yapmalısınız.' }
  }

  const billingRaw =
    body.billingInfo && typeof body.billingInfo === 'object' && !Array.isArray(body.billingInfo)
      ? (body.billingInfo as Record<string, unknown>)
      : {}

  const sanitized = sanitizeBhCheckoutBilling(billingRaw, customer.email)
  if (!sanitized.ok) {
    return { ok: false as const, status: 400, message: sanitized.message }
  }

  const noteTag = `woontegraCustomerId:${customer.id}`

  return {
    ok: true as const,
    body: {
      ...body,
      billingInfo: sanitized.billingInfo,
      customerNote: noteTag,
      woontegraCustomerId: customer.id,
    },
  }
}

async function affiliateUpstreamInit(req: Request, buyer?: { email?: string | null; phone?: string | null }) {
  const affiliate = await resolveBhAffiliateFromRequest(req, buyer)
  const affiliateHeaders = buildBhAffiliateBridgeHeaders(affiliate)
  const channelHeaders = buildWoontegraBhSalesChannelHeaders()
  return {
    affiliate,
    headers: {
      ...channelHeaders,
      ...affiliateHeaders,
    },
  }
}

function extractPaidAmountTl(statusData: unknown): number {
  if (!statusData || typeof statusData !== 'object') return 0
  const root = statusData as Record<string, unknown>
  const nested =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root
  const kurus =
    nested.finalPriceKurus ??
    nested.amount ??
    nested.finalPrice ??
    nested.paidAmountKurus
  if (typeof kurus === 'number' && Number.isFinite(kurus)) {
    // BH stores kuruş for amount fields typically
    if (kurus > 1000) return Math.round(kurus) / 100
    return kurus
  }
  const tl = nested.finalPriceTl ?? nested.totalTl
  if (typeof tl === 'number' && Number.isFinite(tl)) return tl
  return 0
}

function extractCampaignRate(statusData: unknown): number {
  if (!statusData || typeof statusData !== 'object') return 0
  const root = statusData as Record<string, unknown>
  const nested =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root
  const rate = nested.discountRate ?? nested.campaignDiscountRate
  const n = Number(rate)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.trunc(n))) : 0
}

function isBhPaymentSuccess(statusData: unknown): boolean {
  if (!statusData || typeof statusData !== 'object') return false
  const root = statusData as Record<string, unknown>
  const nested =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root
  const status = String(nested.status || nested.paymentStatus || '').toLowerCase()
  return status === 'success' || status === 'paid'
}

async function maybeRecordCommissionAfterPaid(opts: {
  req: Request
  merchantOid: string
  statusData: unknown
  paymentProvider: 'PAYTR' | 'BANK_TRANSFER'
}) {
  if (!isBhPaymentSuccess(opts.statusData)) return null
  try {
    const affiliate = await resolveBhAffiliateFromRequest(opts.req, {
      email: opts.req.customer?.email,
      phone: null,
    })
    const billing =
      opts.statusData && typeof opts.statusData === 'object'
        ? ((opts.statusData as { data?: { email?: string; name?: string } }).data ??
          (opts.statusData as { email?: string; name?: string }))
        : null
    return await recordBhAffiliateCommissionForPaidSale({
      merchantOid: opts.merchantOid,
      customerEmail: opts.req.customer?.email || String(billing?.email || ''),
      customerName: String(billing?.name || opts.req.customer?.email || 'BH Customer'),
      customerPhone: null,
      customerId: opts.req.customer?.id || null,
      finalPriceTl: extractPaidAmountTl(opts.statusData),
      campaignDiscountRate: extractCampaignRate(opts.statusData),
      affiliate,
      paymentProvider: opts.paymentProvider,
    })
  } catch (err) {
    console.warn('[bh-affiliate] commission record failed', err)
    return null
  }
}

/** Public config for FE (no secrets). */
export async function getBhPublicConfig(_req: Request, res: Response) {
  const panelLogin =
    (process.env.BH_PANEL_LOGIN_URL || '').trim() ||
    (process.env.NODE_ENV === 'production'
      ? 'https://panel.bilirkisihesap.com'
      : 'http://127.0.0.1:5173')

  const renewalEnabled =
    String(process.env.BH_SUBSCRIPTION_RENEWAL_ENABLED || process.env.SUBSCRIPTION_RENEWAL_ENABLED || '')
      .trim()
      .toLowerCase() === 'true'

  return res.json({
    success: true,
    data: {
      panelLoginUrl: panelLogin.replace(/\/+$/, ''),
      upstreamConfigured: Boolean(resolveBhWebapiBaseUrl()),
      paymentDryRunHint: process.env.NODE_ENV !== 'production',
      renewalEnabled,
    },
  })
}

export async function getBhProduct(req: Request, res: Response) {
  const result = await bhUpstreamFetch('GET', '/api/product', undefined, {
    cookie: req.headers.cookie,
  })
  return sendUpstream(res, result)
}

export async function postBhQuote(req: Request, res: Response) {
  const { headers } = await affiliateUpstreamInit(req)
  const result = await bhUpstreamFetch('POST', '/api/campaigns/quote', req.body, {
    cookie: req.headers.cookie,
    headers,
  })
  return sendUpstream(res, result)
}

export async function getBhCampaignByCode(req: Request, res: Response) {
  const code = String(req.params.code || '').trim()
  if (!code) {
    return res.status(400).json({ success: false, message: 'Kampanya kodu gerekli.' })
  }
  const result = await bhUpstreamFetch(
    'GET',
    `/api/campaigns/id/${encodeURIComponent(code)}`,
    undefined,
    { cookie: req.headers.cookie },
  )
  return sendUpstream(res, result)
}

export async function postBhDemoRequest(req: Request, res: Response) {
  // Demo does not create commission; attribution cookie remains (first-touch TTL).
  const result = await bhUpstreamFetch('POST', '/api/demo/request', req.body, {
    cookie: req.headers.cookie,
    timeoutMs: 45_000,
  })
  return sendUpstream(res, result)
}

export async function getBhBankTransferAvailability(req: Request, res: Response) {
  const result = await bhUpstreamFetch(
    'GET',
    '/api/payment/bank-transfer-availability',
    undefined,
    { cookie: req.headers.cookie },
  )
  return sendUpstream(res, result)
}

export async function postBhBankTransferOrder(req: Request, res: Response) {
  const prepared = attachWoontegraCustomerToBhBody(req, (req.body || {}) as Record<string, unknown>)
  if (!prepared.ok) {
    return res.status(prepared.status).json({ success: false, message: prepared.message })
  }
  const phone =
    prepared.body.billingInfo && typeof prepared.body.billingInfo === 'object'
      ? String((prepared.body.billingInfo as { phone?: string }).phone || '') || null
      : null
  const { headers } = await affiliateUpstreamInit(req, {
    email: req.customer?.email,
    phone,
  })
  const result = await bhUpstreamFetch('POST', '/api/payment/bank-transfer-order', prepared.body, {
    cookie: req.headers.cookie,
    headers,
    timeoutMs: 45_000,
  })
  return sendUpstream(res, result)
}

/**
 * Woontegra-central BH checkout: BH prepare-sale + WT Order (amount from BH quote only).
 * Client price fields are ignored. PayTR uses WT merchant via /api/payments/paytr/start.
 */
export async function postBhCheckoutCreateOrder(req: Request, res: Response) {
  if (!req.customer?.id || !req.customer.email) {
    return res.status(401).json({ success: false, message: 'Giriş gerekli.' })
  }
  const body = (req.body || {}) as Record<string, unknown>
  const productTypeRaw = String(body.productType || body.product_type || '')
    .trim()
    .toLowerCase()
  const productType =
    productTypeRaw === 'monthly' || productTypeRaw === 'annual' ? productTypeRaw : null
  if (!productType) {
    return res.status(400).json({ success: false, message: 'productType monthly|annual gerekli.' })
  }

  const billingRaw =
    body.billingInfo && typeof body.billingInfo === 'object'
      ? (body.billingInfo as Record<string, unknown>)
      : {}
  const sanitized = sanitizeBhCheckoutBilling(billingRaw, req.customer.email)
  if (!sanitized.ok) {
    return res.status(400).json({ success: false, message: sanitized.message })
  }
  const billingInfo = sanitized.billingInfo as {
    invoiceType?: string
    fullName?: string
    name?: string
    email?: string
    phone?: string
    address?: string
    openAddress?: string
    city?: string
    district?: string
    identityNumber?: string
    companyName?: string
    taxOffice?: string
    taxNumber?: string
  }

  try {
    const created = await createBhCentralCheckoutOrder({
      req,
      customerId: req.customer.id,
      customerEmail: req.customer.email,
      customerName: billingInfo.fullName || billingInfo.name || req.customer.email,
      customerPhone: billingInfo.phone || null,
      productType,
      subscriptionPeriod:
        body.subscriptionPeriod != null ? Number(body.subscriptionPeriod) : undefined,
      campaignPublicCode: String(body.campaignId || body.campaign_id || body.campaignPublicCode || '')
        .trim() || null,
      renewalToken: String(body.renewalToken || '').trim() || null,
      billingInfo,
      legalConsents:
        (body.legalConsents as Record<string, unknown>) ||
        (body.legal_consents as Record<string, unknown>) ||
        undefined,
      checkoutIdempotencyKey: String(body.checkoutIdempotencyKey || body.idempotencyKey || '').trim() || null,
    })
    return res.status(201).json({
      success: true,
      data: {
        orderNo: created.orderNo,
        orderId: created.orderId,
        totalTl: created.totalTl,
        saleRef: created.saleRef,
        paymentProvider: 'PAYTR',
      },
    })
  } catch (e) {
    const err = e as Error & { status?: number; code?: string }
    return res.status(err.status || 500).json({
      success: false,
      code: err.code || null,
      message: err.message || 'Sipariş oluşturulamadı',
    })
  }
}

export async function getBhPaymentPublicStatus(req: Request, res: Response) {
  const merchantOid = String(req.query.merchant_oid || '').trim()
  if (!merchantOid) {
    return res.status(400).json({ success: false, message: 'merchant_oid gerekli.' })
  }
  const result = await bhUpstreamFetch(
    'GET',
    `/api/payment/public-status?merchant_oid=${encodeURIComponent(merchantOid)}`,
    undefined,
    { cookie: req.headers.cookie },
  )
  if (result.ok && result.data) {
    await maybeRecordCommissionAfterPaid({
      req,
      merchantOid,
      statusData: result.data,
      paymentProvider: 'PAYTR',
    })
  }
  return sendUpstream(res, result)
}

/**
 * Authenticated PayTR token. In development, if BH returns dryrun_* token,
 * auto-trigger manual-callback so local ProfessionalLicense can be created.
 * After successful fulfill, records Woontegra affiliate commission (idempotent).
 */
export async function postBhPaytrTokenGuest(req: Request, res: Response) {
  const prepared = attachWoontegraCustomerToBhBody(req, (req.body || {}) as Record<string, unknown>)
  if (!prepared.ok) {
    return res.status(prepared.status).json({ success: false, message: prepared.message })
  }

  const phone =
    prepared.body.billingInfo && typeof prepared.body.billingInfo === 'object'
      ? String((prepared.body.billingInfo as { phone?: string }).phone || '') || null
      : null
  const { affiliate, headers } = await affiliateUpstreamInit(req, {
    email: req.customer?.email,
    phone,
  })

  const result = await bhUpstreamFetch('POST', '/api/payment/paytr-token-guest', prepared.body, {
    cookie: req.headers.cookie,
    headers,
    timeoutMs: 45_000,
  })

  if (!result.ok) return sendUpstream(res, result)

  const data = result.data as {
    success?: boolean
    token?: string
    merchantOid?: string
    testMode?: boolean
    amount?: number
    finalPriceKurus?: number
  }

  const token = String(data?.token || '')
  const merchantOid = String(data?.merchantOid || '')
  const isDryRunToken = token.startsWith('dryrun_')
  const allowAutoFulfill =
    process.env.NODE_ENV !== 'production' &&
    String(process.env.BH_DRY_RUN_AUTO_FULFILL || 'true').toLowerCase() !== 'false'

  let fulfillment: { attempted: boolean; ok?: boolean; error?: string } = { attempted: false }
  let affiliateLedger: { orderNo?: string; createdOrder?: boolean } | null = null

  if (isDryRunToken && allowAutoFulfill && merchantOid) {
    fulfillment.attempted = true
    const cb = await bhManualCallback(merchantOid)
    fulfillment.ok = cb.ok
    if (!cb.ok) fulfillment.error = cb.error

    if (cb.ok) {
      try {
        const status = await bhUpstreamFetch(
          'GET',
          `/api/payment/public-status?merchant_oid=${encodeURIComponent(merchantOid)}`,
        )
        const finalPriceTl =
          extractPaidAmountTl(status.data) ||
          (typeof data.finalPriceKurus === 'number' ? data.finalPriceKurus / 100 : 0) ||
          (typeof data.amount === 'number' ? data.amount / 100 : 0)
        const ledger = await recordBhAffiliateCommissionForPaidSale({
          merchantOid,
          customerEmail: req.customer?.email || '',
          customerName: req.customer?.email || 'BH Customer',
      customerPhone: phone,
      customerId: req.customer?.id || null,
      finalPriceTl,
      campaignDiscountRate: extractCampaignRate(status.data),
      affiliate,
      paymentProvider: 'PAYTR',
    })
        affiliateLedger = { orderNo: ledger.orderNo, createdOrder: ledger.createdOrder }
      } catch (err) {
        console.warn('[bh-affiliate] dry-run commission failed', err)
      }
    }
  }

  return res.status(result.status).json({
    ...data,
    dryRun: isDryRunToken,
    fulfillment,
    affiliateLedger,
    woontegraCustomerId: req.customer?.id,
  })
}

const BH_LEGAL_PREVIEW_TYPES = new Set([
  'PRE_INFORMATION',
  'DISTANCE_SALE',
  'SUBSCRIPTION_AGREEMENT',
  'KVKK',
  'WITHDRAWAL_EXCEPTION',
])

/** BH legal template preview — content SoT stays on BH webapi. */
export async function getBhLegalPreview(req: Request, res: Response) {
  const type = String(req.params.type || '')
    .trim()
    .toUpperCase()
  if (!BH_LEGAL_PREVIEW_TYPES.has(type)) {
    return res.status(400).json({ success: false, message: 'Geçersiz belge tipi.' })
  }
  const qs = new URLSearchParams()
  const productType = String(req.query.productType || '').trim()
  const subscriptionPeriod = String(req.query.subscriptionPeriod || '').trim()
  if (productType) qs.set('productType', productType)
  if (subscriptionPeriod) qs.set('subscriptionPeriod', subscriptionPeriod)
  const path = `/api/legal/templates/${encodeURIComponent(type)}/preview${
    qs.toString() ? `?${qs.toString()}` : ''
  }`
  const result = await bhUpstreamFetch('GET', path, undefined, {
    cookie: req.headers.cookie,
    timeoutMs: 20_000,
  })
  return sendUpstream(res, result)
}

/**
 * Renewal options for the authenticated Woontegra customer’s BH panel account (email match).
 * IDOR: email is taken from JWT only — body.email ignored.
 */
export async function postBhRenewalOptions(req: Request, res: Response) {
  const email = String(req.customer?.email || '')
    .trim()
    .toLowerCase()
  if (!email) {
    return res.status(401).json({ success: false, message: 'Giriş gerekli.' })
  }
  const result = await bhUpstreamFetch(
    'POST',
    '/api/payment/renewal/options-by-email',
    { email },
    {
      headers: buildWoontegraBhSalesChannelHeaders(),
      timeoutMs: 20_000,
    },
  )
  return sendUpstream(res, result)
}

/**
 * Start renewal session for JWT customer email only. Returns opaque renewalToken for checkout.
 */
export async function postBhRenewalStart(req: Request, res: Response) {
  const email = String(req.customer?.email || '')
    .trim()
    .toLowerCase()
  if (!email) {
    return res.status(401).json({ success: false, message: 'Giriş gerekli.' })
  }
  const body = (req.body || {}) as Record<string, unknown>
  // Strip any client-supplied email / userId — force JWT email.
  const result = await bhUpstreamFetch(
    'POST',
    '/api/payment/renewal/start-by-email',
    {
      email,
      productType: body.productType,
      period: body.period ?? body.subscriptionPeriod,
    },
    {
      headers: buildWoontegraBhSalesChannelHeaders(),
      timeoutMs: 20_000,
    },
  )
  return sendUpstream(res, result)
}

/** Token-bound resolve (opaque renewalToken is the capability). */
export async function postBhRenewalResolve(req: Request, res: Response) {
  const result = await bhUpstreamFetch('POST', '/api/payment/renewal/resolve', req.body, {
    cookie: req.headers.cookie,
    headers: buildWoontegraBhSalesChannelHeaders(),
    timeoutMs: 20_000,
  })
  return sendUpstream(res, result)
}

export async function postBhRenewalQuote(req: Request, res: Response) {
  const result = await bhUpstreamFetch('POST', '/api/payment/renewal/quote', req.body, {
    cookie: req.headers.cookie,
    headers: buildWoontegraBhSalesChannelHeaders(),
    timeoutMs: 20_000,
  })
  return sendUpstream(res, result)
}
