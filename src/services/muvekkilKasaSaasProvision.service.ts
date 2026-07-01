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

}



const PROVISION_NOTES = 'Woontegra Website ödeme sonrası otomatik teslimat'



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

      let membershipId: string | undefined

      if (order.customerId) {

        const existingMembership = await prisma.customerSaasMembership.findUnique({

          where: { firstOrderId: externalOrderId },

        })

        membershipId = existingMembership?.id

      }



      provisioned.push({

        orderItemId: item.id,

        productName: item.productName,

        deliveryType: 'SAAS',

        provisionStatus: 'already_exists',

        licenseKey: item.licenseServerLicenseKey?.trim() || null,

        mailSentByMkSaas: true,

        membershipId,

      })

      continue

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

      console.warn('[mk-saas-provision] ACTIVE_MEMBERSHIP_EXISTS — renew akışı kullanılmalı; yeni tenant açılmamalı', {

        orderNo: order.orderNo,

        orderItemId: item.id,

        customerId: order.customerId,

        existingMembershipId: activeMembership.id,

        existingTenantId: activeMembership.tenantId,

        productCode: activeMembership.productCode,

      })

      const err =

        'Bu müşteri hesabında aktif Müvekkil Kasa SaaS üyeliği var. Yeni tenant açılmaz; üyelik yenileme akışı kullanılmalı.'

      errors.push({ orderItemId: item.id, productName: item.productName, error: err })

      await prisma.orderItem.update({

        where: { id: item.id },

        data: { licenseServerLastError: err },

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

      const err = result.error

      errors.push({ orderItemId: item.id, productName: item.productName, error: err })

      await prisma.orderItem.update({

        where: { id: item.id },

        data: { licenseServerLastError: err },

      })

      console.error('[mk-saas-provision] provision failed', {

        orderNo: order.orderNo,

        orderItemId: item.id,

        externalOrderId,

        status: result.status ?? null,

        error: err,

      })

      continue

    }



    const data = result.data

    await prisma.orderItem.update({

      where: { id: item.id },

      data: {

        licenseServerUnitsNotified: 1,

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



    provisioned.push({

      orderItemId: item.id,

      productName: item.productName,

      deliveryType: 'SAAS',

      provisionStatus: data.status,

      licenseKey: data.licenseKey,

      mailSentByMkSaas: data.mailSent !== false,

      membershipId: membershipId ?? undefined,

    })



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



/** Website ödeme onayı mailinde SaaS satırı (lisans anahtarı gönderilmez). */

export function buildMuvekkilKasaSaasMailLines(

  items: { id: string; productName: string }[],

  successes: MuvekkilKasaSaasProvisionSuccess[],

): { id: string; productName: string; downloadUrl: string }[] {

  const okIds = new Set(successes.map((s) => s.orderItemId))

  return items

    .filter((i) => okIds.has(i.id))

    .map((i) => ({

      id: i.id,

      productName: i.productName,

      downloadUrl: 'saas:muvekkil-kasa',

    }))

}


