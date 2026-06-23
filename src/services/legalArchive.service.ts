import { createHash } from 'crypto'
import { LegalDocumentType } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { formatLegalCurrencyDisplay } from '../lib/legalSeller'
import {
  formatPdfMoneyAmount,
  formatPdfProductPlanLabel,
  formatPdfProductQuantityLabel,
} from '../lib/legalArchiveFormat'
import { buildArchiveStorageKey, legalArchiveStorage } from '../lib/legalArchiveStorage'
import {
  renderAcceptanceCertificatePdf,
  renderSnapshotContentToPdf,
  type CertificateRow,
} from './legalArchivePdf'

const SNAPSHOT_FILE_NAMES: Partial<Record<LegalDocumentType, string>> = {
  PRE_INFORMATION: 'on-bilgilendirme-formu.pdf',
  DISTANCE_SALES: 'mesafeli-satis-sozlesmesi.pdf',
  KVKK_CLARIFICATION: 'kvkk-aydinlatma-metni.pdf',
  SOFTWARE_LICENSE: 'yazilim-lisans-ve-kullanim-sozlesmesi.pdf',
  SAAS_SUBSCRIPTION: 'saas-abonelik-ve-kullanim-sozlesmesi.pdf',
}

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function packageNoForOrder(orderNo: string): string {
  return `PKG-${orderNo}`
}

function acceptanceCodeFor(orderNo: string, documentType: LegalDocumentType, version: number): string {
  const slug = orderNo.replace(/[^A-Z0-9]/gi, '').slice(-12) || 'ORD'
  return `WNT-${slug}-${documentType}-${version}`
}

function waiverFileName(snapshot: { title: string; content: string }): string {
  const blob = `${snapshot.title} ${snapshot.content}`.toLowerCase()
  if (blob.includes('hizmet') && (blob.includes('aktivasyon') || blob.includes('aboneliğ'))) {
    return 'dijital-hizmet-cayma-istisnasi-onayi.pdf'
  }
  return 'dijital-urun-cayma-istisnasi-onayi.pdf'
}

function snapshotFileName(snapshot: { documentType: LegalDocumentType; title: string; content: string }): string {
  if (snapshot.documentType === LegalDocumentType.DIGITAL_IMMEDIATE_DELIVERY_WAIVER) {
    return waiverFileName(snapshot)
  }
  return SNAPSHOT_FILE_NAMES[snapshot.documentType] ?? `${snapshot.documentType.toLowerCase()}.pdf`
}

function extractBuyerBlockHtml(snapshots: { content: string }[]): string {
  for (const s of snapshots) {
    const m = s.content.match(/<div class="legal-buyer-block"[\s\S]*?<\/div>/i)
    if (m) return m[0]
  }
  return '<div class="legal-buyer-block"><p>Alıcı bilgileri snapshot içinde bulunamadı.</p></div>'
}

function productLinesHtml(
  items: { productName: string; quantity: number; total: unknown; productType?: string | null }[],
  currency: string,
): string {
  const rows = items
    .map((i) => {
      const qtyLabel = formatPdfProductQuantityLabel(i.quantity, i.productType)
      const plan = formatPdfProductPlanLabel(i.productType)
      const price = formatPdfMoneyAmount(Number(i.total), currency)
      const planPart = plan ? ` — ${plan}` : ''
      return `<li><strong>${escapeHtml(i.productName)}</strong>${planPart} — ${qtyLabel} — ${price}</li>`
    })
    .join('')
  return `<ul>${rows}</ul>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type LegalArchiveFileDto = {
  id: string
  orderId: string
  packageNo: string
  documentType: LegalDocumentType | null
  fileCategory: string
  title: string
  fileName: string
  storageKey: string
  mimeType: string
  size: number
  sha256: string
  acceptanceCode: string | null
  version: number | null
  generatedAt: string
}

function mapArchiveRow(r: {
  id: string
  orderId: string
  packageNo: string
  documentType: LegalDocumentType | null
  fileCategory: string
  title: string
  fileName: string
  storageKey: string
  mimeType: string
  size: number
  sha256: string
  acceptanceCode: string | null
  version: number | null
  generatedAt: Date
}): LegalArchiveFileDto {
  return {
    id: r.id,
    orderId: r.orderId,
    packageNo: r.packageNo,
    documentType: r.documentType,
    fileCategory: r.fileCategory,
    title: r.title,
    fileName: r.fileName,
    storageKey: r.storageKey,
    mimeType: r.mimeType,
    size: r.size,
    sha256: r.sha256,
    acceptanceCode: r.acceptanceCode,
    version: r.version,
    generatedAt: r.generatedAt.toISOString(),
  }
}

export const legalArchiveService = {
  async listByOrderId(orderId: string): Promise<LegalArchiveFileDto[]> {
    const rows = await prisma.orderLegalArchiveFile.findMany({
      where: { orderId },
      orderBy: [{ generatedAt: 'asc' }, { fileName: 'asc' }],
    })
    return rows.map(mapArchiveRow)
  },

  async getFileForDownload(orderId: string, fileId: string) {
    const row = await prisma.orderLegalArchiveFile.findFirst({ where: { id: fileId, orderId } })
    if (!row) {
      const err = new Error('Dosya bulunamadı') as Error & { status: number }
      err.status = 404
      throw err
    }
    const data = await legalArchiveStorage.readFile(row.storageKey)
    return { row, data }
  },

  async generateForOrder(orderId: string, options?: { force?: boolean }) {
    const force = options?.force === true

    const order = await prisma.order.findFirst({
      where: { id: orderId, archivedAt: null },
      include: {
        items: { include: { product: { select: { productType: true } } } },
        legalSnapshots: { orderBy: { acceptedAt: 'asc' } },
        paymentTransactions: { orderBy: { createdAt: 'desc' }, take: 1 },
        legalArchiveFiles: true,
      },
    })

    if (!order) {
      const err = new Error('Sipariş bulunamadı') as Error & { status: number }
      err.status = 404
      throw err
    }

    if (order.legalSnapshots.length === 0) {
      const err = new Error('Bu sipariş için yasal snapshot kaydı yok; arşiv üretilemez.') as Error & {
        status: number
      }
      err.status = 400
      throw err
    }

    const existingCount = order.legalArchiveFiles.length
    if (existingCount > 0 && !force) {
      const err = new Error('Bu sipariş için yasal arşiv zaten oluşturulmuş. Yeniden oluşturmak için force kullanın.') as Error & {
        status: number
        code: string
      }
      err.status = 409
      err.code = 'ARCHIVE_ALREADY_EXISTS'
      throw err
    }

    if (force && existingCount > 0) {
      for (const f of order.legalArchiveFiles) {
        await legalArchiveStorage.deleteFile(f.storageKey)
      }
      await legalArchiveStorage.deleteOrderDirectory(order.orderNo)
      await prisma.orderLegalArchiveFile.deleteMany({ where: { orderId } })
    }

    const packageNo = packageNoForOrder(order.orderNo)
    const generatedAt = new Date()
    const paymentReference =
      order.bankTransferReference?.trim() ||
      order.paymentTransactions[0]?.merchantOid?.trim() ||
      null

    const snapshotPdfMeta: CertificateRow[] = []
    const createdRows: LegalArchiveFileDto[] = []

    for (const snap of order.legalSnapshots) {
      const fileName = snapshotFileName(snap)
      const pdfBuffer = await renderSnapshotContentToPdf(snap.title, snap.content)
      const hash = sha256Hex(pdfBuffer)
      const storageKey = buildArchiveStorageKey(order.orderNo, fileName)
      const { size } = await legalArchiveStorage.writeFile(storageKey, pdfBuffer)
      const acceptanceCode = acceptanceCodeFor(order.orderNo, snap.documentType, snap.version)

      const row = await prisma.orderLegalArchiveFile.create({
        data: {
          orderId,
          packageNo,
          documentType: snap.documentType,
          fileCategory: 'snapshot_pdf',
          title: snap.title,
          fileName,
          storageKey,
          mimeType: 'application/pdf',
          size,
          sha256: hash,
          acceptanceCode,
          version: snap.version,
        },
      })
      createdRows.push(mapArchiveRow(row))
      snapshotPdfMeta.push({
        title: snap.title,
        fileName,
        acceptanceCode,
        sha256: hash,
        version: snap.version,
        acceptedAt: snap.acceptedAt.toISOString(),
      })
    }

    const customerBlock = extractBuyerBlockHtml(order.legalSnapshots)
    const itemsWithType = order.items.map((i) => ({
      productName: i.productName,
      quantity: i.quantity,
      total: i.total,
      productType: i.product?.productType ?? null,
    }))

    const certBuffer = await renderAcceptanceCertificatePdf({
      orderNo: order.orderNo,
      packageNo,
      customerBlockHtml: customerBlock,
      productLinesHtml: productLinesHtml(itemsWithType, order.currency),
      productTypes: order.legalCartProductTypes ?? '',
      paymentReference,
      ipAddress: order.acceptedIp,
      userAgent: order.acceptedUserAgent,
      generatedAt: generatedAt.toISOString(),
      documents: snapshotPdfMeta,
    })
    const certHash = sha256Hex(certBuffer)
    const certFileName = 'elektronik-onay-sertifikasi.pdf'
    const certStorageKey = buildArchiveStorageKey(order.orderNo, certFileName)
    const certWrite = await legalArchiveStorage.writeFile(certStorageKey, certBuffer)
    const certRow = await prisma.orderLegalArchiveFile.create({
      data: {
        orderId,
        packageNo,
        documentType: null,
        fileCategory: 'acceptance_certificate_pdf',
        title: 'Elektronik Onay Sertifikası',
        fileName: certFileName,
        storageKey: certStorageKey,
        mimeType: 'application/pdf',
        size: certWrite.size,
        sha256: certHash,
        acceptanceCode: `WNT-CERT-${order.orderNo.replace(/[^A-Z0-9]/gi, '')}`,
        version: null,
      },
    })
    createdRows.push(mapArchiveRow(certRow))

    const acceptanceJson = {
      orderId: order.id,
      orderNo: order.orderNo,
      packageNo,
      customer: {
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        billingType: order.billingType,
        companyName: order.companyName,
        taxOffice: order.taxOffice,
        taxNumber: order.taxNumber,
      },
      billing: {
        billingType: order.billingType,
        companyName: order.companyName,
        taxOffice: order.taxOffice,
        taxNumber: order.taxNumber,
      },
      products: itemsWithType.map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        lineTotal: Number(i.total),
        productType: i.productType,
      })),
      productTypes: order.legalCartProductTypes,
      currency: formatLegalCurrencyDisplay(order.currency),
      orderTotal: Number(order.total),
      paymentReference,
      acceptedDocuments: [
        ...snapshotPdfMeta.map((d) => ({
          documentType: order.legalSnapshots.find((s) => s.title === d.title)?.documentType ?? null,
          documentTitle: d.title,
          fileName: d.fileName,
          version: d.version,
          acceptedAt: d.acceptedAt,
          ipAddress: order.acceptedIp,
          userAgent: order.acceptedUserAgent,
          acceptanceCode: d.acceptanceCode,
          sha256: d.sha256,
        })),
        {
          documentType: null,
          documentTitle: 'Elektronik Onay Sertifikası',
          fileName: certFileName,
          version: null,
          acceptedAt: generatedAt.toISOString(),
          ipAddress: order.acceptedIp,
          userAgent: order.acceptedUserAgent,
          acceptanceCode: certRow.acceptanceCode,
          sha256: certHash,
        },
      ],
      generatedAt: generatedAt.toISOString(),
    }

    const jsonBuffer = Buffer.from(JSON.stringify(acceptanceJson, null, 2), 'utf8')
    const jsonHash = sha256Hex(jsonBuffer)
    const jsonFileName = 'acceptance.json'
    const jsonStorageKey = buildArchiveStorageKey(order.orderNo, jsonFileName)
    const jsonWrite = await legalArchiveStorage.writeFile(jsonStorageKey, jsonBuffer)
    const jsonRow = await prisma.orderLegalArchiveFile.create({
      data: {
        orderId,
        packageNo,
        documentType: null,
        fileCategory: 'acceptance_json',
        title: 'acceptance.json',
        fileName: jsonFileName,
        storageKey: jsonStorageKey,
        mimeType: 'application/json',
        size: jsonWrite.size,
        sha256: jsonHash,
        acceptanceCode: null,
        version: null,
      },
    })
    createdRows.push(mapArchiveRow(jsonRow))

    return {
      packageNo,
      files: createdRows,
      acceptanceJson,
    }
  },
}
