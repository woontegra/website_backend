import { prisma } from '../lib/prisma'

import {

  isMuvekkilKasaSaasProduct,

  MUVEKKIL_KASA_SAAS_PRODUCT_CODE,

} from '../lib/muvekkilKasaSaasProduct'

import { resolveOrderCustomerNameForLicense } from './license.service'

import {

  isMuvekkilKasaSaasProvisionConfigured,

  requestMuvekkilKasaSaasProvision,

} from './muvekkilKasaSaasProvision.client'

import { resolveMuvekkilKasaSaasLoginHref } from '../lib/mailDownloadLink'

import {
  formatMkOwnerEmailDuplicateError,
  isMkOwnerEmailDuplicateError,
} from '../lib/mkSaasDeliveryHelpers'

import {

  findActiveCustomerSaasMembership,

  upsertCustomerSaasMembershipAfterProvision,

} from './customerSaasMembership.service'



export type MuvekkilKasaSaasProvisionError = {

  orderItemId: string

  productName: string

  error: string

}



export type MuvekkilKasaSaasProvisionSuccess = {

  orderItemId: string

  productName: string

  deliveryType: 'SAAS'

  provisionStatus: 'created' | 'already_exists'

  licenseKey: string | null

  mailSentByMkSaas: boolean

  membershipId?: string

  tenantSlug: string

  tenantName: string

  ownerEmail: string

  ownerUsername: string | null

  temporaryPassword: string | null

  loginUrl: string | null

  musteriNo: string | null

  licenseStartDate: string

  licenseEndDate: string

}



export type MuvekkilKasaSaasMailLine = {

  id: string

  productName: string

  downloadUrl: string

  saas: {

    licenseKey: string | null

    ownerEmail: string

    tenantSlug: string

    tenantName: string

    licenseStartDate: string

    licenseEndDate: string

    mkActivationMailSent: boolean

    ownerUsername: string | null

    temporaryPassword: string | null

    loginUrl: string | null

    musteriNo: string | null

  }

}



const PROVISION_NOTES = 'Woontegra Website ödeme sonrası otomatik teslimat'

function provisionSuccessIsMailReady(success: MuvekkilKasaSaasProvisionSuccess): boolean {
  return Boolean(success.membershipId && success.licenseKey?.trim())
}

async function linkOrderItemToMembership(orderItemId: string, membershipId: string): Promise<void> {
  await prisma.orderItem.update({
    where: { id: orderItemId },
    data: { saasMembershipId: membershipId },
  })
}

async function loadMembershipForExternalOrderId(externalOrderId: string) {
  return prisma.customerSaasMembership.findUnique({
    where: { firstOrderId: externalOrderId },
  })
}

async function findWoontegraMembershipForCustomerEmail(customerId: string, ownerEmail: string) {
  const normalized = ownerEmail.trim().toLowerCase()
  return prisma.customerSaasMembership.findFirst({
    where: {
      customerId,
      productCode: MUVEKKIL_KASA_SAAS_PRODUCT_CODE,
      ownerEmail: normalized,
    },
    orderBy: { createdAt: 'desc' },
  })
}

async function buildProvisionSuccessFromMembership(input: {
  orderItemId: string
  productName: string
  officeName: string
  customerEmail: string
  membership: {
    id: string
    tenantSlug: string
    licenseKey: string
    ownerEmail: string
    licenseStartDate: Date
    licenseEndDate: Date
  }
  provisionStatus: 'created' | 'already_exists'
  mailSentByMkSaas: boolean
  ownerUsername?: string | null
  temporaryPassword?: string | null
  loginUrl?: string | null
  musteriNo?: string | null
}): Promise<MuvekkilKasaSaasProvisionSuccess> {
  await linkOrderItemToMembership(input.orderItemId, input.membership.id)
  return {
    orderItemId: input.orderItemId,
    productName: input.productName,
    deliveryType: 'SAAS',
    provisionStatus: input.provisionStatus,
    licenseKey: input.membership.licenseKey.trim() || null,
    mailSentByMkSaas: input.mailSentByMkSaas,
    membershipId: input.membership.id,
    tenantSlug: input.membership.tenantSlug,
    tenantName: input.officeName,
    ownerEmail: input.membership.ownerEmail,
    ownerUsername: input.ownerUsername?.trim() || null,
    temporaryPassword: input.temporaryPassword?.trim() || null,
    loginUrl: input.loginUrl ?? resolveMuvekkilKasaSaasLoginHref(),
    musteriNo: input.musteriNo ?? null,
    licenseStartDate: input.membership.licenseStartDate.toISOString(),
    licenseEndDate: input.membership.licenseEndDate.toISOString(),
  }
}

function resolveMkLoginUrlFromProvision(data: { loginUrl?: string | null }): string | null {
  return resolveMuvekkilKasaSaasLoginHref(data.loginUrl)
}



function resolveOfficeName(order: {

  companyName?: string | null

  customerName: string

}): string {

  return order.companyName?.trim() || order.customerName.trim()

}



function externalOrderIdForItem(orderNo: string, orderItemId: string): string {

  return `${orderNo}:${orderItemId}`

}



export function isOrderItemMuvekkilKasaSaas(item: {

  productSlug?: string | null

  product: {

    slug?: string | null

    licenseAppCode?: string | null

  } | null

}): boolean {

  if (isMuvekkilKasaSaasProduct(item.product)) return true

  return isMuvekkilKasaSaasProduct({ slug: item.productSlug, licenseAppCode: item.product?.licenseAppCode })

}



async function recordMembershipFromProvisionResponse(input: {

  customerId: string

  productId: string | null

  externalOrderId: string

  data: {

    tenantId: string

    tenantSlug: string

    licenseKey: string | null

    ownerEmail: string

    licenseStartDate: string

    licenseEndDate: string

  }

}): Promise<string | null> {

  const licenseKey = input.data.licenseKey?.trim()

  if (!licenseKey) {

    console.error('[mk-saas-provision] membership skipped: empty licenseKey', {

      externalOrderId: input.externalOrderId,

      tenantId: input.data.tenantId,

    })

    return null

  }



  const result = await upsertCustomerSaasMembershipAfterProvision({

    customerId: input.customerId,

    productId: input.productId,

    productCode: MUVEKKIL_KASA_SAAS_PRODUCT_CODE,

    tenantId: input.data.tenantId,

    tenantSlug: input.data.tenantSlug,

    licenseKey,

    ownerEmail: input.data.ownerEmail,

    licenseStartDate: new Date(input.data.licenseStartDate),

    licenseEndDate: new Date(input.data.licenseEndDate),

    firstOrderId: input.externalOrderId,

    lastOrderId: input.externalOrderId,

  })



  if (result.created) {

    console.info('[mk-saas-provision] CustomerSaasMembership created', {

      membershipId: result.id,

      customerId: input.customerId,

      tenantId: input.data.tenantId,

      externalOrderId: input.externalOrderId,

    })

  }



  return result.id

}



/**

 * Müvekkil Kasa SaaS satırları için doğrudan MK SaaS API provisioning (merkezi lisans yok).

 */

export async function ensureMuvekkilKasaSaasOrders(orderId: string): Promise<{

  errors: MuvekkilKasaSaasProvisionError[]

  provisioned: MuvekkilKasaSaasProvisionSuccess[]

}> {

  const errors: MuvekkilKasaSaasProvisionError[] = []

  const provisioned: MuvekkilKasaSaasProvisionSuccess[] = []



  const order = await prisma.order.findUnique({

    where: { id: orderId },

    include: {

      customer: { select: { name: true } },

      items: {

        include: {

          product: {

            select: {

              id: true,

              slug: true,

              licenseAppCode: true,

              licenseDays: true,

            },

          },

        },

      },

    },

  })



  if (!order) return { errors, provisioned }

  if (order.status !== 'PAID' && order.status !== 'PROCESSING') return { errors, provisioned }



  const customerName = resolveOrderCustomerNameForLicense(order)

  const customerEmail = order.customerEmail.trim().toLowerCase()

  const paidAt = order.paidAt ?? order.paymentConfirmedAt ?? order.bankTransferPaymentDate ?? new Date()



  for (const item of order.items) {

    if (item.saasMembershipId) continue

    if (!isOrderItemMuvekkilKasaSaas(item)) continue



    const externalOrderId = externalOrderIdForItem(order.orderNo, item.id)



    const already = item.licenseServerUnitsNotified ?? 0

    if (already >= 1) {

      const existingMembership = order.customerId
        ? await loadMembershipForExternalOrderId(externalOrderId)
        : null

      if (existingMembership?.licenseKey?.trim()) {
        await prisma.orderItem.update({
          where: { id: item.id },
          data: { licenseServerLastError: null, licenseServerLicenseKey: existingMembership.licenseKey.trim() },
        })
        provisioned.push(
          await buildProvisionSuccessFromMembership({
            orderItemId: item.id,
            productName: item.productName,
            officeName: resolveOfficeName(order),
            customerEmail,
            membership: existingMembership,
            provisionStatus: 'already_exists',
            mailSentByMkSaas: true,
          }),
        )
        continue
      }

      if (item.licenseServerLastError?.trim()) {
        await prisma.orderItem.update({
          where: { id: item.id },
          data: { licenseServerUnitsNotified: 0 },
        })
      } else {
        continue
      }

    }



    if (!order.customerId?.trim()) {

      const err = 'Müvekkil Kasa SaaS teslimatı için müşteri hesabı (customerId) gerekli.'

      errors.push({ orderItemId: item.id, productName: item.productName, error: err })

      await prisma.orderItem.update({

        where: { id: item.id },

        data: { licenseServerLastError: err },

      })

      console.error('[mk-saas-provision] missing customerId', { orderNo: order.orderNo, orderItemId: item.id })

      continue

    }



    const activeMembership = await findActiveCustomerSaasMembership(order.customerId)

    if (activeMembership) {

      const licenseDays = Math.max(1, item.product?.licenseDays ?? 365)

      console.info('[mk-saas-provision] ACTIVE_MEMBERSHIP_EXISTS — yenileme akışına yönlendiriliyor', {

        orderNo: order.orderNo,

        orderItemId: item.id,

        customerId: order.customerId,

        existingMembershipId: activeMembership.id,

        existingTenantId: activeMembership.tenantId,

      })

      await prisma.orderItem.update({

        where: { id: item.id },

        data: {

          saasMembershipId: activeMembership.id,

          saasRenewalDays: licenseDays,

          licenseServerLastError: null,

        },

      })

      continue

    }



    if (!isMuvekkilKasaSaasProvisionConfigured()) {

      const err = 'Müvekkil Kasa SaaS API yapılandırması eksik (MUVEKKIL_KASA_SAAS_API_URL / SECRET).'

      errors.push({ orderItemId: item.id, productName: item.productName, error: err })

      await prisma.orderItem.update({

        where: { id: item.id },

        data: { licenseServerLastError: err },

      })

      console.error('[mk-saas-provision] not configured', { orderNo: order.orderNo, orderItemId: item.id })

      continue

    }



    const licenseDays = Math.max(1, item.product?.licenseDays ?? 365)

    const officeName = resolveOfficeName(order)

    const provisionClaim = await prisma.orderItem.updateMany({
      where: { id: item.id, licenseServerUnitsNotified: 0 },
      data: {
        licenseServerUnitsNotified: 1,
        licenseServerLastNotifiedAt: new Date(),
      },
    })

    if (provisionClaim.count === 0) {
      const existingMembership = order.customerId
        ? await loadMembershipForExternalOrderId(externalOrderId)
        : null

      if (existingMembership?.licenseKey?.trim()) {
        await prisma.orderItem.update({
          where: { id: item.id },
          data: { licenseServerLastError: null, licenseServerLicenseKey: existingMembership.licenseKey.trim() },
        })
        provisioned.push(
          await buildProvisionSuccessFromMembership({
            orderItemId: item.id,
            productName: item.productName,
            officeName: officeName,
            customerEmail,
            membership: existingMembership,
            provisionStatus: 'already_exists',
            mailSentByMkSaas: true,
          }),
        )
      }
      continue
    }

    const result = await requestMuvekkilKasaSaasProvision({

      externalOrderId,

      externalCustomerId: order.customerId,

      productCode: MUVEKKIL_KASA_SAAS_PRODUCT_CODE,

      customer: {

        name: customerName,

        email: customerEmail,

        phone: order.customerPhone?.trim() || null,

      },

      tenant: {

        name: officeName,

        officeName,

        phone: order.customerPhone?.trim() || null,

        email: customerEmail,

        taxNumber: order.taxNumber?.trim() || null,

        taxOffice: order.taxOffice?.trim() || null,

      },

      licenseDays,

      licenseStatus: 'AKTIF',

      demoMu: false,

      billing: {

        amount: Number(item.total),

        currency: order.currency || 'TRY',

        paidAt: paidAt.toISOString(),

      },

      notes: PROVISION_NOTES,

    })



    if (!result.success) {

      let err = formatMkOwnerEmailDuplicateError(result.error)

      if (
        isMkOwnerEmailDuplicateError(result.error, result.code) &&
        order.customerId
      ) {
        const linkedMembership = await findWoontegraMembershipForCustomerEmail(
          order.customerId,
          customerEmail,
        )
        if (linkedMembership?.licenseKey?.trim()) {
          await prisma.orderItem.update({
            where: { id: item.id },
            data: {
              licenseServerUnitsNotified: 1,
              licenseServerLastError: null,
              licenseServerLastNotifiedAt: new Date(),
              licenseServerLicenseKey: linkedMembership.licenseKey.trim(),
              saasMembershipId: linkedMembership.id,
            },
          })
          provisioned.push(
            await buildProvisionSuccessFromMembership({
              orderItemId: item.id,
              productName: item.productName,
              officeName,
              customerEmail,
              membership: linkedMembership,
              provisionStatus: 'already_exists',
              mailSentByMkSaas: false,
            }),
          )
          console.info('[mk-saas-provision] linked existing Woontegra membership after duplicate email', {
            orderNo: order.orderNo,
            orderItemId: item.id,
            membershipId: linkedMembership.id,
          })
          continue
        }
      }

      errors.push({ orderItemId: item.id, productName: item.productName, error: err })

      await prisma.orderItem.update({

        where: { id: item.id },

        data: { licenseServerUnitsNotified: 0, licenseServerLastError: err },

      })

      console.error('[mk-saas-provision] provision failed', {

        orderNo: order.orderNo,

        orderItemId: item.id,

        externalOrderId,

        status: result.status ?? null,

        code: result.code ?? null,

        error: err,

      })

      continue

    }



    const data = result.data

    await prisma.orderItem.update({

      where: { id: item.id },

      data: {

        licenseServerLastError: data.mailError ?? null,

        licenseServerLastNotifiedAt: new Date(),

        licenseServerLicenseKey: data.licenseKey?.trim() || null,

      },

    })



    const membershipId = await recordMembershipFromProvisionResponse({

      customerId: order.customerId,

      productId: item.productId,

      externalOrderId,

      data,

    })

    if (membershipId) {
      await linkOrderItemToMembership(item.id, membershipId)
    }

    const successEntry: MuvekkilKasaSaasProvisionSuccess = {

      orderItemId: item.id,

      productName: item.productName,

      deliveryType: 'SAAS',

      provisionStatus: data.status,

      licenseKey: data.licenseKey,

      mailSentByMkSaas: data.mailSent !== false,

      membershipId: membershipId ?? undefined,

      tenantSlug: data.tenantSlug,

      tenantName: officeName,

      ownerEmail: data.ownerEmail,

      ownerUsername: data.ownerUsername?.trim() || null,

      temporaryPassword: data.temporaryPassword?.trim() || null,

      loginUrl: resolveMkLoginUrlFromProvision(data),

      musteriNo: data.musteriNo ?? null,

      licenseStartDate: data.licenseStartDate,

      licenseEndDate: data.licenseEndDate,

    }

    if (provisionSuccessIsMailReady(successEntry)) {
      provisioned.push(successEntry)
    } else {
      const err =
        data.licenseKey?.trim()
          ? 'Müvekkil Kasa SaaS üyelik kaydı oluşturulamadı.'
          : 'Müvekkil Kasa SaaS tenant oluşturuldu ancak lisans anahtarı alınamadı.'
      errors.push({ orderItemId: item.id, productName: item.productName, error: err })
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { licenseServerLastError: err },
      })
    }



    console.info('[mk-saas-provision] provision ok', {

      orderNo: order.orderNo,

      orderItemId: item.id,

      externalOrderId,

      status: data.status,

      tenantId: data.tenantId,

      membershipId: membershipId ?? null,

      mailSent: data.mailSent,

    })

  }



  return { errors, provisioned }

}



/** Website ödeme onayı mailinde Müvekkil Kasa SaaS satırları. */

export function buildMuvekkilKasaSaasMailLines(

  items: { id: string; productName: string }[],

  successes: MuvekkilKasaSaasProvisionSuccess[],

): MuvekkilKasaSaasMailLine[] {

  const byItemId = new Map(
    successes.filter((s) => provisionSuccessIsMailReady(s)).map((s) => [s.orderItemId, s]),
  )

  return items

    .filter((i) => byItemId.has(i.id))

    .map((i) => {

      const s = byItemId.get(i.id)!

      return {

        id: i.id,

        productName: i.productName,

        downloadUrl: 'saas:muvekkil-kasa',

        saas: {

          licenseKey: s.licenseKey,

          ownerEmail: s.ownerEmail,

          tenantSlug: s.tenantSlug,

          tenantName: s.tenantName,

          licenseStartDate: s.licenseStartDate,

          licenseEndDate: s.licenseEndDate,

          mkActivationMailSent: s.mailSentByMkSaas,

          ownerUsername: s.ownerUsername,

          temporaryPassword: s.temporaryPassword,

          loginUrl: s.loginUrl,

          musteriNo: s.musteriNo,

        },

      }

    })

}


