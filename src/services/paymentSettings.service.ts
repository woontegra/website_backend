import { PaymentProvider, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { resolvePaytrFailUrlBase, resolvePaytrSuccessUrlBase } from '../lib/paytrFrontendReturnUrl'
import { decryptSecret, encryptSecret } from '../utils/secretCrypto'

/** PayTR panelinde kullanılacak callback tam URL’si (log/uyarı için; boş olabilir). */
export async function resolvePaytrCallbackUrlForLogging(): Promise<string> {
  const row = await prisma.paymentSettings.findUnique({ where: { provider: PaymentProvider.PAYTR } })
  const fromDb = row?.callbackUrl?.trim()
  if (fromDb) return fromDb
  const base = process.env.BACKEND_PUBLIC_URL?.trim() || process.env.PAYTR_CALLBACK_BASE?.trim() || ''
  if (!base) return ''
  return `${base.replace(/\/$/, '')}/api/payments/paytr/callback`
}

export type EffectivePaytrConfig = {
  merchantId: string
  merchantKey: string
  merchantSalt: string
  testMode: '0' | '1'
  debugOn: '0' | '1'
  successUrlBase: string
  failUrlBase: string
  source: 'database' | 'env'
}

function envPaytr(): EffectivePaytrConfig | null {
  const merchantId = process.env.PAYTR_MERCHANT_ID?.trim() || ''
  const merchantKey = process.env.PAYTR_MERCHANT_KEY?.trim() || ''
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT?.trim() || ''
  if (!merchantId || !merchantKey || !merchantSalt) return null
  return {
    merchantId,
    merchantKey,
    merchantSalt,
    testMode: process.env.PAYTR_TEST_MODE === 'true' ? '1' : '0',
    debugOn: process.env.PAYTR_DEBUG_ON === 'true' ? '1' : '0',
    successUrlBase: resolvePaytrSuccessUrlBase(process.env.FRONTEND_SUCCESS_URL),
    failUrlBase: resolvePaytrFailUrlBase(process.env.FRONTEND_FAIL_URL),
    source: 'env',
  }
}

export async function getEffectivePaytrConfig(): Promise<EffectivePaytrConfig> {
  const row = await prisma.paymentSettings.findUnique({ where: { provider: PaymentProvider.PAYTR } })
  const fromEnv = envPaytr()
  if (row?.isActive && row.merchantId.trim()) {
    const key =
      row.merchantKeyEncrypted.trim() !== '' ? decryptSecret(row.merchantKeyEncrypted) : fromEnv?.merchantKey || ''
    const salt =
      row.merchantSaltEncrypted.trim() !== '' ? decryptSecret(row.merchantSaltEncrypted) : fromEnv?.merchantSalt || ''
    if (key && salt) {
      return {
        merchantId: row.merchantId.trim(),
        merchantKey: key,
        merchantSalt: salt,
        testMode: row.testMode ? '1' : '0',
        debugOn: row.debugOn ? '1' : '0',
        successUrlBase: resolvePaytrSuccessUrlBase(row.successUrl?.trim() || process.env.FRONTEND_SUCCESS_URL),
        failUrlBase: resolvePaytrFailUrlBase(row.failUrl?.trim() || process.env.FRONTEND_FAIL_URL),
        source: 'database',
      }
    }
  }
  if (fromEnv) return fromEnv
  throw new Error('PayTR yapılandırması yok: admin Ödeme Ayarları veya PAYTR_* ortam değişkenlerini doldurun')
}

const MASK = '••••••••••••••••'

export async function getAdminPaytrDto() {
  const row = await prisma.paymentSettings.findUnique({ where: { provider: PaymentProvider.PAYTR } })
  if (!row) {
    return {
      provider: 'PAYTR',
      isActive: false,
      testMode: true,
      merchantId: '',
      merchantKeyMasked: '',
      merchantSaltMasked: '',
      callbackUrl: null as string | null,
      successUrl: null as string | null,
      failUrl: null as string | null,
      debugOn: true,
      callbackPath: '/api/payments/paytr/callback',
    }
  }
  return {
    provider: 'PAYTR',
    isActive: row.isActive,
    testMode: row.testMode,
    merchantId: row.merchantId,
    merchantKeyMasked: row.merchantKeyEncrypted.trim() ? MASK : '',
    merchantSaltMasked: row.merchantSaltEncrypted.trim() ? MASK : '',
    callbackUrl: row.callbackUrl,
    successUrl: row.successUrl,
    failUrl: row.failUrl,
    debugOn: row.debugOn,
    callbackPath: '/api/payments/paytr/callback',
  }
}

export async function patchAdminPaytr(body: Record<string, unknown>) {
  const row = await prisma.paymentSettings.upsert({
    where: { provider: PaymentProvider.PAYTR },
    create: {
      provider: PaymentProvider.PAYTR,
      isActive: false,
      testMode: true,
      merchantId: '',
      merchantKeyEncrypted: '',
      merchantSaltEncrypted: '',
      debugOn: true,
    },
    update: {},
  })

  const patch: Prisma.PaymentSettingsUpdateInput = {}

  if (typeof body.isActive === 'boolean') patch.isActive = body.isActive
  if (typeof body.testMode === 'boolean') patch.testMode = body.testMode
  if (typeof body.debugOn === 'boolean') patch.debugOn = body.debugOn
  if (typeof body.merchantId === 'string') patch.merchantId = body.merchantId.trim()

  if (typeof body.callbackUrl === 'string' || body.callbackUrl === null) {
    patch.callbackUrl = body.callbackUrl === null ? null : String(body.callbackUrl).trim() || null
  }
  if (typeof body.successUrl === 'string' || body.successUrl === null) {
    if (body.successUrl === null) {
      patch.successUrl = null
    } else {
      const trimmed = String(body.successUrl).trim()
      patch.successUrl = trimmed ? resolvePaytrSuccessUrlBase(trimmed) : null
    }
  }
  if (typeof body.failUrl === 'string' || body.failUrl === null) {
    if (body.failUrl === null) {
      patch.failUrl = null
    } else {
      const trimmed = String(body.failUrl).trim()
      patch.failUrl = trimmed ? resolvePaytrFailUrlBase(trimmed) : null
    }
  }

  const mk = typeof body.merchantKey === 'string' ? body.merchantKey.trim() : undefined
  if (mk !== undefined && mk !== '' && mk !== MASK) {
    patch.merchantKeyEncrypted = encryptSecret(mk)
  }
  const ms = typeof body.merchantSalt === 'string' ? body.merchantSalt.trim() : undefined
  if (ms !== undefined && ms !== '' && ms !== MASK) {
    patch.merchantSaltEncrypted = encryptSecret(ms)
  }

  await prisma.paymentSettings.update({
    where: { id: row.id },
    data: patch,
  })

  return getAdminPaytrDto()
}
