import type { Request, Response } from 'express'
import { LicenseLifecycleStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  headDownloadSource,
  resolveDownloadSourceFromRawUrl,
  streamDownloadSource,
  type ResolvedDownloadSource,
} from '../lib/downloadStream'
import { isPublicFreeDownloadProduct } from '../lib/productDownloadFiles'
import { verifyOrderDownloadToken, type OrderDownloadTokenPayload } from '../lib/orderDownloadToken'
import { mergeOrderItemDownloadUrl } from './orderFulfillment.service'
import { resolveLicenseDownloadUrl } from './license.service'

export type OrderDownloadAccess =
  | { kind: 'ok'; source: ResolvedDownloadSource; context: Record<string, unknown> }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }

async function sourceFromLicense(licenseId: string): Promise<ResolvedDownloadSource | null> {
  const lic = await prisma.license.findUnique({
    where: { id: licenseId },
    select: {
      id: true,
      status: true,
      productId: true,
      productCode: true,
    },
  })
  if (!lic || lic.status !== LicenseLifecycleStatus.ACTIVE) return null
  const rawUrl = await resolveLicenseDownloadUrl(lic)
  return resolveDownloadSourceFromRawUrl(rawUrl)
}

async function sourceFromOrderItem(payload: OrderDownloadTokenPayload): Promise<ResolvedDownloadSource | null> {
  const order = await prisma.order.findUnique({
    where: { id: payload.orderId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              productType: true,
              purchaseEnabled: true,
              price: true,
              licenseRequired: true,
              downloadUrl: true,
              downloadMedia: { select: { url: true } },
            },
          },
        },
      },
    },
  })
  if (!order || (order.status !== 'PAID' && order.status !== 'PROCESSING')) {
    return null
  }

  const item = order.items.find((i) => i.id === payload.orderItemId)
  if (!item) return null

  if (item.product && isPublicFreeDownloadProduct(item.product)) {
    return null
  }

  const rawUrl = mergeOrderItemDownloadUrl({
    id: item.id,
    productName: item.productName,
    downloadUrl: item.downloadUrl,
    product: item.product,
  })
  return resolveDownloadSourceFromRawUrl(rawUrl)
}

export async function classifyOrderDownloadAccess(token: string): Promise<OrderDownloadAccess> {
  const payload = verifyOrderDownloadToken(token)
  if (!payload) return { kind: 'not_found' }

  let source: ResolvedDownloadSource | null = null
  let context: Record<string, unknown> = {
    orderId: payload.orderId,
    orderItemId: payload.orderItemId,
    licenseId: payload.licenseId ?? null,
  }

  if (payload.licenseId) {
    source = await sourceFromLicense(payload.licenseId)
  }
  if (!source) {
    source = await sourceFromOrderItem(payload)
  }
  if (!source) {
    const order = await prisma.order.findUnique({
      where: { id: payload.orderId },
      select: { status: true },
    })
    if (order && order.status !== 'PAID' && order.status !== 'PROCESSING') {
      return { kind: 'forbidden' }
    }
    return { kind: 'not_found' }
  }

  context = {
    ...context,
    fileName: source.filename,
    objectKey: source.objectKey ?? null,
    sourceKind: source.kind,
  }

  return { kind: 'ok', source, context }
}

export async function streamOrderProductDownload(token: string, req: Request, res: Response): Promise<void> {
  const access = await classifyOrderDownloadAccess(token)
  if (access.kind !== 'ok') {
    throw new Error(access.kind === 'forbidden' ? 'FORBIDDEN' : 'NOT_FOUND')
  }

  const meta = await headDownloadSource(access.source)
  const range = req.headers.range ?? null
  console.info('[downloads] order token stream', {
    ...access.context,
    size: meta.size,
    range,
  })

  await streamDownloadSource(access.source, req, res)
}

export async function headOrderProductDownload(token: string): Promise<{ filename: string; size: number } | null> {
  const access = await classifyOrderDownloadAccess(token)
  if (access.kind !== 'ok') return null
  const meta = await headDownloadSource(access.source)
  return { filename: access.source.filename, size: meta.size }
}

/** Mail gönderilmeden önce token ile indirilebilir kaynak var mı */
export async function canBuildOrderDownloadLink(payload: OrderDownloadTokenPayload): Promise<boolean> {
  if (payload.licenseId) {
    const source = await sourceFromLicense(payload.licenseId)
    if (source) return true
  }
  const source = await sourceFromOrderItem(payload)
  return source !== null
}
