import crypto from 'crypto'
import type { Request } from 'express'
import { Prisma } from '@prisma/client'
import { paytrCallbackUrlLooksLocalOrPrivate } from '../lib/paytrCallbackUrl'
import { buildPaytrMerchantReturnUrl } from '../lib/paytrReturnUrl'
import { prisma } from '../lib/prisma'
import { mailService } from './mail.service'
import { getEffectivePaytrConfig, resolvePaytrCallbackUrlForLogging } from './paymentSettings.service'

export function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.length > 0) {
    return xf.split(',')[0].trim().slice(0, 39)
  }
  const raw = req.socket.remoteAddress || '127.0.0.1'
  return String(raw).replace(/^::ffff:/, '').slice(0, 39)
}

function paytrHmacBase64(secretKey: string, data: string): string {
  return crypto.createHmac('sha256', secretKey).update(data, 'utf8').digest('base64')
}

function toPaytrCurrency(currency: string): string {
  const c = (currency || 'TRY').trim().toUpperCase()
  return c === 'TRY' || c === 'TL' ? 'TL' : c
}

function paymentAmountKurus(total: Prisma.Decimal | number): number {
  const n = typeof total === 'number' ? total : Number(total)
  return Math.round(n * 100)
}

/** PayTR merchant_oid: yalnızca harf ve rakam (tire, alt çizgi vb. yok). */
export function toPaytrMerchantOid(orderNo: string): string {
  return String(orderNo ?? '').replace(/[^a-zA-Z0-9]/g, '')
}

function buildUserBasket(
  items: { productName: string; unitPrice: number; quantity: number }[],
): string {
  const basket = items.map((i) => [
    i.productName.slice(0, 200),
    i.unitPrice.toFixed(2),
    i.quantity,
  ])
  return Buffer.from(JSON.stringify(basket), 'utf8').toString('base64')
}

export function verifyPaytrCallbackHash(
  merchantOid: string,
  status: string,
  totalAmount: string,
  receivedHash: string,
  merchantKey: string,
  merchantSalt: string,
): boolean {
  const data = merchantOid + merchantSalt + status + totalAmount
  const token = paytrHmacBase64(merchantKey, data)
  return token === receivedHash
}

export const paytrService = {
  async startIframePayment(orderNo: string, req: Request): Promise<{ iframeToken: string }> {
    const env = await getEffectivePaytrConfig()

    if (!env.successUrlBase?.trim() || !env.failUrlBase?.trim()) {
      const err = new Error('Başarı veya hata yönlendirme adresi yapılandırılmamış') as Error & { status: number }
      err.status = 500
      throw err
    }

    const order = await prisma.order.findUnique({
      where: { orderNo },
      include: { items: { orderBy: { id: 'asc' } } },
    })

    if (!order) {
      const err = new Error('Sipariş bulunamadı') as Error & { status: number }
      err.status = 404
      throw err
    }

    if (order.status !== 'PENDING') {
      const err = new Error('Bu sipariş için ödeme başlatılamaz') as Error & { status: number }
      err.status = 400
      throw err
    }

    const existingSuccess = await prisma.paymentTransaction.findFirst({
      where: { orderId: order.id, status: 'SUCCESS' },
    })
    if (existingSuccess) {
      const err = new Error('Bu sipariş zaten ödenmiş') as Error & { status: number }
      err.status = 400
      throw err
    }

    if (order.items.length === 0) {
      const err = new Error('Sipariş kalemi bulunamadı') as Error & { status: number }
      err.status = 400
      throw err
    }

    const paymentAmount = paymentAmountKurus(order.total)
    const currency = toPaytrCurrency(order.currency)
    const userIp = getClientIp(req)
    const email = order.customerEmail.slice(0, 100)
    const paytrMerchantOid = toPaytrMerchantOid(order.orderNo)
    if (!paytrMerchantOid || paytrMerchantOid.length < 6) {
      const err = new Error('Sipariş numarası PayTR için uygun değil') as Error & { status: number }
      err.status = 500
      throw err
    }
    const basketRows = order.items.map((i) => ({
      productName: i.productName,
      unitPrice: Number(i.unitPrice),
      quantity: i.quantity,
    }))
    const userBasket = buildUserBasket(basketRows)
    const noInstallment = '1'
    const maxInstallment = '0'
    const testMode = env.testMode

    const hashStr =
      env.merchantId +
      userIp +
      paytrMerchantOid +
      email +
      String(paymentAmount) +
      userBasket +
      noInstallment +
      maxInstallment +
      currency +
      testMode

    const paytrToken = paytrHmacBase64(env.merchantKey, hashStr + env.merchantSalt)

    const merchantOkUrl = buildPaytrMerchantReturnUrl(env.successUrlBase, order.orderNo).trim()
    const merchantFailUrl = buildPaytrMerchantReturnUrl(env.failUrlBase, order.orderNo).trim()
    if (!merchantOkUrl || !merchantFailUrl) {
      const err = new Error('Başarı veya hata URL’si oluşturulamadı') as Error & { status: number }
      err.status = 500
      throw err
    }

    const cbProbe = await resolvePaytrCallbackUrlForLogging()
    if (paytrCallbackUrlLooksLocalOrPrivate(cbProbe)) {
      console.warn(
        '[paytr] CALLBACK UYARISI: PayTR sunucusu localhost/private adrese POST atamaz. Railway/canlı HTTPS API kökü ve mağaza panelindeki Bildirim URL’yi kontrol edin:',
        cbProbe || '(callbackUrl / BACKEND_PUBLIC_URL tanımsız)',
      )
    } else if (!cbProbe.trim()) {
      console.warn(
        '[paytr] CALLBACK: Veritabanında callbackUrl veya ortamda BACKEND_PUBLIC_URL / PAYTR_CALLBACK_BASE yok; PayTR panelinde kayıtlı tam callback adresinin dışarıdan erişilebilir olduğundan emin olun.',
      )
    }
    if (paytrCallbackUrlLooksLocalOrPrivate(merchantOkUrl) || paytrCallbackUrlLooksLocalOrPrivate(merchantFailUrl)) {
      console.warn(
        '[paytr] Başarı/hata yönlendirme adresi localhost görünüyor (tarayıcı testi için normaldir). Canlıda FRONTEND_SUCCESS_URL ve FRONTEND_FAIL_URL kullanın.',
      )
    }

    const merchantOkUrlFinal = merchantOkUrl.slice(0, 400)
    const merchantFailUrlFinal = merchantFailUrl.slice(0, 400)
    if (!merchantOkUrlFinal.startsWith('http') || !merchantFailUrlFinal.startsWith('http')) {
      const err = new Error('Başarı veya hata yönlendirme adresi geçersiz') as Error & { status: number }
      err.status = 500
      throw err
    }

    await prisma.paymentTransaction.deleteMany({
      where: {
        orderId: order.id,
        status: 'PENDING',
        merchantOid: { not: paytrMerchantOid },
      },
    })

    await prisma.paymentTransaction.upsert({
      where: { merchantOid: paytrMerchantOid },
      create: {
        orderId: order.id,
        merchantOid: paytrMerchantOid,
        status: 'PENDING',
        amount: order.total,
        currency: order.currency,
        providerRawPayload: Prisma.JsonNull,
      },
      update: {
        status: 'PENDING',
        amount: order.total,
        currency: order.currency,
        providerRawPayload: Prisma.JsonNull,
      },
    })

    const body = new URLSearchParams({
      merchant_id: env.merchantId,
      user_ip: userIp,
      merchant_oid: paytrMerchantOid,
      email,
      payment_amount: String(paymentAmount),
      paytr_token: paytrToken,
      user_basket: userBasket,
      debug_on: env.debugOn,
      no_installment: noInstallment,
      max_installment: maxInstallment,
      user_name: order.customerName.slice(0, 60),
      user_address: 'Dijital ürün',
      user_phone: (order.customerPhone || '05000000000').slice(0, 20),
      merchant_ok_url: merchantOkUrlFinal,
      merchant_fail_url: merchantFailUrlFinal,
      timeout_limit: '30',
      currency,
      test_mode: testMode,
      lang: 'tr',
    })

    const res = await fetch('https://www.paytr.com/odeme/api/get-token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    const text = await res.text()
    let json: { status?: string; token?: string; reason?: string }
    try {
      json = JSON.parse(text) as typeof json
    } catch {
      const err = new Error('PayTR yanıtı okunamadı') as Error & { status: number }
      err.status = 502
      throw err
    }

    if (json.status !== 'success' || !json.token) {
      const raw = json.reason || json.status || 'PayTR token alınamadı'
      const msg =
        /merchant_oid|alfanumerik|özel karakter/i.test(String(raw))
          ? 'Ödeme oturumu başlatılamadı. Lütfen bir süre sonra tekrar deneyin veya destek ile iletişime geçin.'
          : String(raw)
      const err = new Error(msg) as Error & { status: number }
      err.status = 502
      throw err
    }

    return { iframeToken: json.token }
  },

  async handleCallback(payload: Record<string, string>, req?: Request): Promise<void> {
    const merchantOid = String(payload.merchant_oid ?? '')
    const status = String(payload.status ?? '')
    const totalAmount = String(payload.total_amount ?? '')
    const hash = String(payload.hash ?? '')

    console.info('[paytr] callback işleme başladı', {
      merchant_oid: merchantOid,
      status,
      total_amount: totalAmount,
    })

    if (!merchantOid || !status || !totalAmount || !hash) {
      console.warn('[paytr] callback eksik parametre', {
        merchant_oid: merchantOid,
        status,
        total_amount: totalAmount,
        hasHash: Boolean(hash),
      })
      const err = new Error('Eksik callback parametreleri') as Error & { status: number }
      err.status = 400
      throw err
    }

    const cfg = await getEffectivePaytrConfig()
    const hashOk = verifyPaytrCallbackHash(merchantOid, status, totalAmount, hash, cfg.merchantKey, cfg.merchantSalt)
    console.info('[paytr] callback hash doğrulama', { merchantOid, status, hashOk })
    if (!hashOk) {
      const err = new Error('Geçersiz imza') as Error & { status: number }
      err.status = 400
      throw err
    }

    const txRow = await prisma.paymentTransaction.findUnique({
      where: { merchantOid },
      select: { orderId: true, status: true },
    })
    const order = txRow
      ? await prisma.order.findUnique({
          where: { id: txRow.orderId },
          include: { items: { orderBy: { id: 'asc' } } },
        })
      : await prisma.order.findUnique({
          where: { orderNo: merchantOid },
          include: { items: { orderBy: { id: 'asc' } } },
        })

    console.info('[paytr] callback eşleştirme', {
      merchantOid,
      transactionFound: Boolean(txRow),
      transactionStatus: txRow?.status ?? null,
      orderFound: Boolean(order),
      orderNo: order?.orderNo ?? null,
      orderId: order?.id ?? null,
      orderStatusBefore: order?.status ?? null,
    })

    if (!order) {
      console.warn('[paytr] callback sipariş bulunamadı', { merchantOid })
      const err = new Error('Sipariş bulunamadı') as Error & { status: number }
      err.status = 404
      throw err
    }

    const expectedKurus = paymentAmountKurus(order.total)
    const got = Number.parseInt(totalAmount, 10)
    if (!Number.isFinite(got) || got !== expectedKurus) {
      console.warn('[paytr] callback tutar uyuşmazlığı', { merchantOid, expectedKurus, got, orderTotal: String(order.total) })
      const err = new Error('Tutar uyuşmazlığı') as Error & { status: number }
      err.status = 400
      throw err
    }

    const rawJson = payload as unknown as Prisma.InputJsonValue

    if (order.status === 'PAID') {
      await prisma.paymentTransaction.updateMany({
        where: { merchantOid },
        data: { providerRawPayload: rawJson },
      })
      console.info('[paytr] callback: sipariş zaten PAID; payload güncellendi', {
        merchantOid,
        orderNo: order.orderNo,
        callbackStatus: status,
      })
      return
    }

    if (status === 'success') {
      const previousStatus = order.status
      let firstCompletion = false
      await prisma.$transaction(async (tx) => {
        const u = await tx.paymentTransaction.updateMany({
          where: { merchantOid, status: 'PENDING' },
          data: { status: 'SUCCESS', providerRawPayload: rawJson },
        })
        if (u.count > 0) {
          firstCompletion = true
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'PAID', paidAt: new Date() },
          })
          return
        }
        const pt = await tx.paymentTransaction.findUnique({ where: { merchantOid } })
        if (pt?.status === 'SUCCESS') {
          await tx.order.updateMany({
            where: { id: order.id, status: { not: 'PAID' } },
            data: { status: 'PAID', paidAt: new Date() },
          })
          return
        }
        const err = new Error('Ödeme kaydı güncellenemedi') as Error & { status: number }
        err.status = 500
        throw err
      })

      if (!firstCompletion) {
        console.info('[paytr] callback: yinelenen başarı; mail/indirme logu atlandı', {
          merchantOid,
          orderNo: order.orderNo,
          previousOrderStatus: previousStatus,
        })
        return
      }

      console.info('[paytr] callback: sipariş PAID olarak tamamlandı', {
        merchantOid,
        orderNo: order.orderNo,
        previousOrderStatus: previousStatus,
      })

      const fresh = await prisma.order.findUnique({
        where: { id: order.id },
        include: { items: { orderBy: { id: 'asc' } } },
      })

      if (fresh && !fresh.downloadEmailSentAt) {
        const lines = fresh.items
          .map((i) => ({ productName: i.productName, downloadUrl: i.downloadUrl ?? '' }))
          .filter((l) => l.downloadUrl)
        if (lines.length > 0) {
          try {
            await mailService.sendPaidDownloadOrder({
              customerName: fresh.customerName,
              customerEmail: fresh.customerEmail,
              orderNo: fresh.orderNo,
              lines,
            })
            await prisma.order.update({
              where: { id: fresh.id },
              data: { downloadEmailSentAt: new Date() },
            })
          } catch (e) {
            console.error('[orders] paid mail send failed', e)
          }
        } else {
          console.error('[orders] PAID siparişte indirme URL yok; e-posta gönderilmedi', fresh.orderNo)
        }
      }

      const first = order.items[0]
      const ua = req?.headers['user-agent']
      await prisma.downloadLog.create({
        data: {
          orderId: order.id,
          productId: first?.productId ?? null,
          customerEmail: order.customerEmail,
          ipAddress: req ? getClientIp(req) : null,
          userAgent: typeof ua === 'string' ? ua.slice(0, 500) : null,
        },
      })

      return
    }

    if (status === 'failed') {
      await prisma.$transaction(async (tx) => {
        await tx.paymentTransaction.updateMany({
          where: { merchantOid },
          data: {
            status: 'FAILED',
            providerRawPayload: rawJson,
          },
        })
        if (order.status === 'PENDING') {
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'FAILED' },
          })
        }
      })
      console.info('[paytr] callback failed işlendi', { merchantOid, orderNo: order.orderNo, orderWas: order.status })
    }
  },
}
