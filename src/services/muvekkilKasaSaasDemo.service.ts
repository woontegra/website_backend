import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { CustomerSaasMembershipStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { MUVEKKIL_KASA_SAAS_PRODUCT_CODE } from '../lib/muvekkilKasaSaasProduct'
import { resolveMuvekkilKasaSaasLoginHref } from '../lib/mailDownloadLink'
import {
  isMuvekkilKasaSaasProvisionConfigured,
  requestMuvekkilKasaSaasProvision,
} from './muvekkilKasaSaasProvision.client'
import { upsertCustomerSaasMembershipAfterProvision } from './customerSaasMembership.service'
import { mailService } from './mail.service'

const SALT_ROUNDS = 10
const DEMO_DAYS = 7
const MK_SAAS_PRODUCT_SLUG = 'muvekkil-kasa-defteri-web-tabanli'
const MK_SAAS_PRODUCT_NAME = 'Müvekkil Kasa Defteri Çoklu Kullanıcı Web Tabanlı'

export type MuvekkilKasaDemoRequestInput = {
  fullName: string
  phone: string
  email: string
  barAssociation: string
  note?: string | null
}

export type MuvekkilKasaDemoRequestResult = {
  membershipId: string
  demoRef: string
  loginUrl: string | null
  licenseEndDate: string
}

function demoHttpError(
  status: number,
  message: string,
  code?: string,
): Error & { status: number; code?: string; publicMessage?: string } {
  const err = new Error(message) as Error & { status: number; code?: string; publicMessage?: string }
  err.status = status
  err.publicMessage = message
  if (code) err.code = code
  return err
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function asDemoOrderRef(): string {
  return `DEMO:${crypto.randomUUID()}`
}

function generateSecurePassword(): string {
  const raw = crypto.randomBytes(12).toString('base64url')
  return raw.slice(0, 14)
}

async function assertDemoEligibility(email: string): Promise<void> {
  const normalized = normalizeEmail(email)
  const now = new Date()

  const memberships = await prisma.customerSaasMembership.findMany({
    where: {
      productCode: MUVEKKIL_KASA_SAAS_PRODUCT_CODE,
      OR: [{ ownerEmail: normalized }, { customer: { email: normalized } }],
    },
    orderBy: { createdAt: 'desc' },
  })

  for (const membership of memberships) {
    const isDemo = membership.firstOrderId.startsWith('DEMO:')
    const active =
      membership.status === CustomerSaasMembershipStatus.ACTIVE && membership.licenseEndDate >= now

    if (isDemo) {
      throw demoHttpError(
        409,
        active
          ? 'Bu e-posta adresi için aktif bir demo erişimi zaten mevcut.'
          : 'Bu e-posta adresi daha önce demo kullanmış. Yeni demo için lütfen destek ile iletişime geçin.',
        active ? 'ACTIVE_DEMO' : 'DEMO_ALREADY_USED',
      )
    }

    if (active) {
      throw demoHttpError(
        409,
        'Bu e-posta adresi için aktif bir Müvekkil Kasa aboneliği bulunuyor. Mevcut hesabınızla giriş yapabilirsiniz.',
        'ACTIVE_PAID_MEMBERSHIP',
      )
    }
  }
}

async function ensureCustomerForDemo(input: {
  fullName: string
  email: string
  phone: string
}): Promise<{ customerId: string; created: boolean; plainPassword?: string }> {
  const email = normalizeEmail(input.email)
  const name = input.fullName.trim()
  const phone = input.phone.trim()

  const existing = await prisma.customer.findUnique({ where: { email } })
  if (existing) {
    await prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: name || existing.name,
        phone: phone || existing.phone,
      },
    })
    return { customerId: existing.id, created: false }
  }

  const plainPassword = generateSecurePassword()
  const passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS)
  const created = await prisma.customer.create({
    data: {
      name,
      email,
      phone,
      passwordHash,
    },
  })
  return { customerId: created.id, created: true, plainPassword }
}

async function resolveMkSaasProductId(): Promise<string | null> {
  const product = await prisma.product.findFirst({
    where: {
      slug: MK_SAAS_PRODUCT_SLUG,
      isActive: true,
    },
    select: { id: true },
  })
  return product?.id ?? null
}

export const muvekkilKasaSaasDemoService = {
  async createDemoRequest(input: MuvekkilKasaDemoRequestInput): Promise<MuvekkilKasaDemoRequestResult> {
    const fullName = input.fullName.trim()
    const phone = input.phone.trim()
    const email = normalizeEmail(input.email)
    const barAssociation = input.barAssociation.trim()
    const note = input.note?.trim() || null

    if (fullName.length < 2) {
      throw demoHttpError(400, 'Ad soyad zorunludur.')
    }
    if (!phone) {
      throw demoHttpError(400, 'Telefon zorunludur.')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw demoHttpError(400, 'Geçerli bir e-posta adresi girin.')
    }
    if (!barAssociation) {
      throw demoHttpError(400, 'Baro bilgisi zorunludur.')
    }

    if (!isMuvekkilKasaSaasProvisionConfigured()) {
      throw demoHttpError(
        503,
        'Demo erişimi şu anda yapılandırılmamış. Lütfen daha sonra tekrar deneyin veya destek ile iletişime geçin.',
        'PROVISION_NOT_CONFIGURED',
      )
    }

    await assertDemoEligibility(email)

    const demoRef = asDemoOrderRef()
    const { customerId, created: customerCreated, plainPassword } = await ensureCustomerForDemo({
      fullName,
      email,
      phone,
    })

    const productId = await resolveMkSaasProductId()
    const officeName = `${fullName} — ${barAssociation}`.slice(0, 120)
    const provisionNotes = [
      'Woontegra Website demo talebi',
      `Baro: ${barAssociation}`,
      note ? `Not: ${note}` : null,
    ]
      .filter(Boolean)
      .join(' | ')

    const provisionResult = await requestMuvekkilKasaSaasProvision({
      externalOrderId: demoRef,
      externalCustomerId: customerId,
      productCode: MUVEKKIL_KASA_SAAS_PRODUCT_CODE,
      customer: {
        name: fullName,
        email,
        phone,
      },
      tenant: {
        name: officeName,
        officeName,
        phone,
        email,
      },
      licenseDays: DEMO_DAYS,
      licenseStatus: 'AKTIF',
      demoMu: true,
      notes: provisionNotes,
    })

    if (!provisionResult.success) {
      console.error('[mk-saas-demo] provision failed', {
        demoRef,
        email,
        error: provisionResult.error,
        status: provisionResult.status ?? null,
      })
      throw demoHttpError(
        502,
        provisionResult.error ||
          'Demo erişimi oluşturulamadı. Lütfen daha sonra tekrar deneyin veya destek ile iletişime geçin.',
        'PROVISION_FAILED',
      )
    }

    const data = provisionResult.data
    const licenseKey = data.licenseKey?.trim()
    if (!licenseKey) {
      console.error('[mk-saas-demo] provision ok but licenseKey empty', { demoRef, email, tenantId: data.tenantId })
      throw demoHttpError(502, 'Demo erişimi tamamlanamadı (lisans anahtarı alınamadı).', 'PROVISION_INCOMPLETE')
    }

    const licenseStartDate = new Date(data.licenseStartDate)
    const licenseEndDate = new Date(data.licenseEndDate)
    const membership = await upsertCustomerSaasMembershipAfterProvision({
      customerId,
      productId,
      productCode: MUVEKKIL_KASA_SAAS_PRODUCT_CODE,
      tenantId: data.tenantId,
      tenantSlug: data.tenantSlug,
      licenseKey,
      ownerEmail: data.ownerEmail,
      licenseStartDate,
      licenseEndDate,
      firstOrderId: demoRef,
      lastOrderId: demoRef,
      status: CustomerSaasMembershipStatus.ACTIVE,
    })

    const loginUrl = resolveMuvekkilKasaSaasLoginHref(data.loginUrl)

    try {
      await mailService.sendMkSaasDemoCreatedMail({
        customerName: fullName,
        customerEmail: email,
        barAssociation,
        productName: MK_SAAS_PRODUCT_NAME,
        licenseEndDate,
        loginUrl,
        licenseKey,
        ownerEmail: data.ownerEmail,
        ownerUsername: data.ownerUsername?.trim() || null,
        temporaryPassword: data.temporaryPassword?.trim() || null,
        tenantSlug: data.tenantSlug,
        musteriNo: data.musteriNo ?? null,
        woontegraAccountCreated: customerCreated,
        woontegraPlainPassword: customerCreated ? plainPassword ?? null : null,
      })
    } catch (mailErr) {
      console.error('[mk-saas-demo] customer mail failed', {
        demoRef,
        email,
        error: mailErr instanceof Error ? mailErr.message : mailErr,
      })
      throw demoHttpError(
        502,
        'Demo erişimi oluşturuldu ancak bilgilendirme e-postası gönderilemedi. Lütfen destek ile iletişime geçin.',
        'DEMO_MAIL_FAILED',
      )
    }

    void mailService
      .sendMkSaasDemoAdminNotification({
        fullName,
        phone,
        email,
        barAssociation,
        note,
        demoRef,
        licenseEndDate,
        tenantId: data.tenantId,
        tenantSlug: data.tenantSlug,
        licenseKey,
        loginUrl,
      })
      .catch((err) => {
        console.error('[mk-saas-demo] admin notification failed', {
          demoRef,
          error: err instanceof Error ? err.message : err,
        })
      })

    console.info('[mk-saas-demo] demo created', {
      demoRef,
      email,
      membershipId: membership.id,
      tenantId: data.tenantId,
      customerCreated,
    })

    return {
      membershipId: membership.id,
      demoRef,
      loginUrl,
      licenseEndDate: licenseEndDate.toISOString(),
    }
  },
}
