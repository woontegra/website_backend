import { CustomerSaasMembershipStatus } from '@prisma/client'

import { prisma } from '../lib/prisma'

import { MUVEKKIL_KASA_SAAS_PRODUCT_CODE } from '../lib/muvekkilKasaSaasProduct'

import {

  isMuvekkilKasaSaasRenewConfigured,

  requestMuvekkilKasaSaasRenew,

} from './muvekkilKasaSaasRenew.client'

import { updateCustomerSaasMembershipAfterRenew } from './customerSaasMembership.service'



export type MuvekkilKasaSaasRenewError = {

  orderItemId: string

  productName: string

  error: string

}



export type MuvekkilKasaSaasRenewSuccess = {

  orderItemId: string

  productName: string

  renewStatus: 'renewed' | 'already_renewed'

  licenseKey: string

  newEndDate: string

  membershipId: string

  mailSentByMkSaas: boolean

}



const RENEW_NOTES = 'Woontegra Website üzerinden üyelik yenileme'



function externalOrderIdForItem(orderNo: string, orderItemId: string): string {

  return `${orderNo}:${orderItemId}`

}



/**

 * SaaS üyelik yenileme satırları için MK SaaS renew endpoint (provision değil).

 */

export async function ensureMuvekkilKasaSaasRenewals(orderId: string): Promise<{

  errors: MuvekkilKasaSaasRenewError[]

  renewed: MuvekkilKasaSaasRenewSuccess[]

}> {

  const errors: MuvekkilKasaSaasRenewError[] = []

  const renewed: MuvekkilKasaSaasRenewSuccess[] = []



  const order = await prisma.order.findUnique({

    where: { id: orderId },

    include: {

      items: {

        include: {

          saasMembership: true,

        },

      },

    },

  })



  if (!order) return { errors, renewed }

  if (order.status !== 'PAID' && order.status !== 'PROCESSING') return { errors, renewed }



  const customerId = order.customerId?.trim()

  if (!customerId) return { errors, renewed }



  const paidAt = order.paidAt ?? order.paymentConfirmedAt ?? order.bankTransferPaymentDate ?? new Date()



  for (const item of order.items) {

    if (!item.saasMembershipId || !item.saasRenewalDays || item.saasRenewalDays < 1) continue



    const membership = item.saasMembership

    if (!membership) {

      const err = 'Üyelik kaydı bulunamadı.'

      errors.push({ orderItemId: item.id, productName: item.productName, error: err })

      await prisma.orderItem.update({

        where: { id: item.id },

        data: { licenseServerLastError: err },

      })

      continue

    }



    if (membership.customerId !== customerId) {

      const err = 'Üyelik bu müşteri hesabına ait değil.'

      errors.push({ orderItemId: item.id, productName: item.productName, error: err })

      await prisma.orderItem.update({

        where: { id: item.id },

        data: { licenseServerLastError: err },

      })

      continue

    }



    if (membership.productCode !== MUVEKKIL_KASA_SAAS_PRODUCT_CODE) {
      const err = 'Yalnızca Müvekkil Kasa SaaS üyelikleri yenilenebilir.'
      errors.push({ orderItemId: item.id, productName: item.productName, error: err })
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { licenseServerLastError: err },
      })
      continue
    }

    const externalOrderId = externalOrderIdForItem(order.orderNo, item.id)
    const licenseKey = membership.licenseKey.trim()

    const already = item.licenseServerUnitsNotified ?? 0
    if (already >= 1) {
      renewed.push({
        orderItemId: item.id,
        productName: item.productName,
        renewStatus: 'already_renewed',
        licenseKey,
        newEndDate: membership.licenseEndDate.toISOString(),
        membershipId: membership.id,
        mailSentByMkSaas: true,
      })
      continue
    }

    if (!isMuvekkilKasaSaasRenewConfigured()) {

      const err = 'Müvekkil Kasa SaaS API yapılandırması eksik (MUVEKKIL_KASA_SAAS_API_URL / SECRET).'

      errors.push({ orderItemId: item.id, productName: item.productName, error: err })

      await prisma.orderItem.update({

        where: { id: item.id },

        data: { licenseServerLastError: err },

      })

      console.error('[mk-saas-renew] not configured', { orderNo: order.orderNo, orderItemId: item.id })

      continue

    }



    const result = await requestMuvekkilKasaSaasRenew({

      externalOrderId,

      externalCustomerId: customerId,

      productCode: MUVEKKIL_KASA_SAAS_PRODUCT_CODE,

      tenantId: membership.tenantId,

      licenseKey,

      renewalDays: item.saasRenewalDays,

      billing: {

        amount: Number(item.total),

        currency: order.currency || 'TRY',

        paidAt: paidAt.toISOString(),

      },

      notes: RENEW_NOTES,

    })



    if (!result.success) {

      const err = result.error

      errors.push({ orderItemId: item.id, productName: item.productName, error: err })

      await prisma.orderItem.update({

        where: { id: item.id },

        data: { licenseServerLastError: err },

      })

      console.error('[mk-saas-renew] renew failed', {

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

        licenseServerLicenseKey: data.licenseKey?.trim() || licenseKey,

      },

    })



    await updateCustomerSaasMembershipAfterRenew({

      membershipId: membership.id,

      licenseEndDate: new Date(data.newEndDate),

      lastOrderId: externalOrderId,

      status: CustomerSaasMembershipStatus.ACTIVE,

    })



    renewed.push({

      orderItemId: item.id,

      productName: item.productName,

      renewStatus: data.status,

      licenseKey: data.licenseKey,

      newEndDate: data.newEndDate,

      membershipId: membership.id,

      mailSentByMkSaas: data.mailSent !== false,

    })



    console.info('[mk-saas-renew] renew ok', {

      orderNo: order.orderNo,

      orderItemId: item.id,

      externalOrderId,

      status: data.status,

      tenantId: data.tenantId,

      membershipId: membership.id,

      newEndDate: data.newEndDate,

      mailSent: data.mailSent,

    })

  }



  return { errors, renewed }

}

