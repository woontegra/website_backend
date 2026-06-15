/**
 * DOWNLOAD ürünlerinde teslimat URL’si, mail için çözümlenmiş href ve (relative /uploads için) dosya varlığı.
 * Çalıştır: npm run report:download-delivery  (backend klasöründe, DATABASE_URL gerekli)
 */
import fs from 'fs'
import 'dotenv/config'
import { PrismaClient, ProductType } from '@prisma/client'
import {
  localPublicFilePathForMailUploadsHref,
  pickBackendPublicOrigin,
  resolveMailDownloadHref,
} from '../src/lib/mailDeliveryUrl'

const prisma = new PrismaClient()

type RowIssue =
  | 'missing_url'
  | 'unresolvable_url'
  | 'file_missing'
  | 'backend_origin_unset_for_relative_uploads'

async function main() {
  const rows = await prisma.product.findMany({
    where: { productType: ProductType.DOWNLOAD },
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      purchaseEnabled: true,
      downloadUrl: true,
      downloadMedia: { select: { url: true } },
    },
  })

  const backendOrigin = pickBackendPublicOrigin()

  const details: {
    productId: string
    slug: string | null
    name: string
    rawUrl: string
    publicHref: string | null
    issues: RowIssue[]
    localPath: string | null
    fileExists: boolean | null
  }[] = []

  for (const p of rows) {
    const raw = (p.downloadUrl?.trim() || p.downloadMedia?.url?.trim() || '') || ''
    const issues: RowIssue[] = []
    if (!raw) {
      issues.push('missing_url')
      details.push({
        productId: p.id,
        slug: p.slug,
        name: p.name,
        rawUrl: '',
        publicHref: null,
        issues,
        localPath: null,
        fileExists: null,
      })
      continue
    }

    if (raw.startsWith('/uploads/') && !backendOrigin) {
      issues.push('backend_origin_unset_for_relative_uploads')
    }

    const publicHref = resolveMailDownloadHref(raw)
    if (!publicHref) {
      issues.push('unresolvable_url')
    }

    let localPath: string | null = null
    let fileExists: boolean | null = null
    if (publicHref) {
      localPath = localPublicFilePathForMailUploadsHref(publicHref)
      if (localPath) {
        fileExists = fs.existsSync(localPath)
        if (!fileExists) issues.push('file_missing')
      }
    }

    details.push({
      productId: p.id,
      slug: p.slug,
      name: p.name,
      rawUrl: raw,
      publicHref,
      issues,
      localPath,
      fileExists,
    })
  }

  const issueCount = details.filter((d) => d.issues.length > 0).length
  const purchasableButBroken = rows.filter((p) => {
    if (!p.isActive || !p.purchaseEnabled) return false
    const d = details.find((x) => x.productId === p.id)
    return d ? d.issues.length > 0 : true
  })

  // eslint-disable-next-line no-console -- CLI raporu
  console.log(
    JSON.stringify(
      {
        backendPublicOrigin: backendOrigin,
        downloadProductCount: rows.length,
        rowsWithAnyIssueCount: issueCount,
        purchasableButBrokenCount: purchasableButBroken.length,
        rows: details,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())
