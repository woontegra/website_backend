/**
 * LegalDocument kayıtlarını kod içi uzun varsayılan şablonlarla senkronize eder.
 *
 *   npm run legal:sync-defaults -- --dry-run
 *   npm run legal:sync-defaults -- --apply
 *
 * Varsayılan: --dry-run (yazma yapmaz).
 */
import fs from 'fs'
import path from 'path'
import { config } from 'dotenv'
import { LegalDocumentType, PrismaClient } from '@prisma/client'
import {
  DEFAULT_LEGAL_TITLES,
  getDefaultLegalDocument,
} from '../src/data/defaultLegalContents'

config({ path: path.resolve(process.cwd(), '.env') })
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.join(process.cwd(), 'scripts/resolve-database-url.cjs')).applyToProcessEnv()
} catch {
  /* */
}

const SYNC_TYPES: LegalDocumentType[] = [
  'PRE_INFORMATION',
  'DISTANCE_SALES',
  'KVKK_CLARIFICATION',
  'SOFTWARE_LICENSE',
  'SAAS_SUBSCRIPTION',
  'DIGITAL_IMMEDIATE_DELIVERY_WAIVER',
]

const STALE_PHONE_PATTERNS = [/0531\s*586/i, /05315861755/, /905315861755/, /315861755/]

type BackupRow = {
  id: string
  type: LegalDocumentType
  title: string
  content: string
  version: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

type PlannedUpdate = {
  id: string
  type: LegalDocumentType
  action: 'update' | 'create'
  reason: string
  currentLength: number
  newLength: number
  newTitle: string
  previousTitle?: string
  previousVersion?: number
}

function parseMode(argv: string[]): 'dry-run' | 'apply' {
  if (argv.includes('--apply')) return 'apply'
  return 'dry-run'
}

function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function containsStaleMarkers(content: string): boolean {
  return STALE_PHONE_PATTERNS.some((re) => re.test(content))
}

function containsRenderedTry(content: string): boolean {
  if (content.includes('{{currency}}')) return false
  return /\bTRY\b/.test(content)
}

/** Admin görünümü: waiver için DOWNLOAD + SAAS metinleri bir arada (checkout variant mantığı kodda kalır). */
function getWaiverAdminTemplate(): { title: string; content: string } {
  const download = getDefaultLegalDocument('DIGITAL_IMMEDIATE_DELIVERY_WAIVER', 'DOWNLOAD')
  const saas = getDefaultLegalDocument('DIGITAL_IMMEDIATE_DELIVERY_WAIVER', 'SAAS')
  const title = DEFAULT_LEGAL_TITLES.DIGITAL_IMMEDIATE_DELIVERY_WAIVER ?? 'Dijital Teslim ve Cayma Hakkı İstisnası Onayı'
  const content = `<div class="legal-doc legal-doc-waiver-admin">
<p class="legal-admin-note"><em>Yönetim notu: Checkout ve sipariş snapshot'larında ürün tipine göre <strong>DOWNLOAD</strong> veya <strong>SAAS</strong> varyantı otomatik kullanılır. Aşağıda her iki uzun metin referans olarak bir arada gösterilir.</em></p>
<section data-variant="DOWNLOAD">
<h2>DOWNLOAD varyantı — ${download.title}</h2>
${download.content}
</section>
<section data-variant="SAAS">
<h2>SAAS varyantı — ${saas.title}</h2>
${saas.content}
</section>
</div>`
  return { title, content }
}

function getTargetTemplate(type: LegalDocumentType): { title: string; content: string } {
  if (type === 'DIGITAL_IMMEDIATE_DELIVERY_WAIVER') {
    return getWaiverAdminTemplate()
  }
  return getDefaultLegalDocument(type)
}

function isWaiverVariantComplete(content: string): boolean {
  const lower = content.toLowerCase()
  const hasDownload =
    lower.includes('kurulum dosyası') ||
    lower.includes('dijital ürünün') ||
    lower.includes('dijital ürün hemen teslim')
  const hasSaas =
    lower.includes('aboneliğimin') ||
    lower.includes('dijital hizmet hemen aktivasyon') ||
    lower.includes('dijital hizmetin ifasına')
  return hasDownload && hasSaas
}

const BUYER_BLOCK_TYPES: LegalDocumentType[] = [
  'PRE_INFORMATION',
  'DISTANCE_SALES',
  'SOFTWARE_LICENSE',
  'SAAS_SUBSCRIPTION',
  'DIGITAL_IMMEDIATE_DELIVERY_WAIVER',
]

function usesLegacyBuyerLine(content: string): boolean {
  return (
    content.includes('{{customerName}} — {{customerEmail}}') ||
    content.includes('{{customerName}} - {{customerEmail}}') ||
    (content.includes('<strong>Alıcı:</strong> {{customerName}}') && !content.includes('{{buyerInfoBlock}}')) ||
    (content.includes('<strong>Abone:</strong> {{customerName}}') && !content.includes('{{buyerInfoBlock}}'))
  )
}

function assessContent(type: LegalDocumentType, content: string): { outdated: boolean; reason: string } {
  const trimmed = content.trim()
  const target = getTargetTemplate(type)

  if (!trimmed) {
    return { outdated: true, reason: 'içerik boş' }
  }
  if (containsStaleMarkers(trimmed)) {
    return { outdated: true, reason: 'eski telefon numarası içeriyor' }
  }
  if (containsRenderedTry(trimmed)) {
    return { outdated: true, reason: 'TRY para birimi gösterimi içeriyor' }
  }

  if (normalizeForCompare(trimmed) === normalizeForCompare(target.content)) {
    return { outdated: false, reason: 'zaten güncel şablonla aynı' }
  }

  const minLen = Math.floor(target.content.length * 0.85)
  if (trimmed.length < minLen) {
    return { outdated: true, reason: `kısa içerik (${trimmed.length} < ${minLen} beklenen)` }
  }

  if (type === 'DIGITAL_IMMEDIATE_DELIVERY_WAIVER' && !isWaiverVariantComplete(trimmed)) {
    return { outdated: true, reason: 'waiver tek varyant veya eksik DOWNLOAD/SAAS içeriği' }
  }

  if (BUYER_BLOCK_TYPES.includes(type)) {
    if (!trimmed.includes('{{buyerInfoBlock}}')) {
      return { outdated: true, reason: 'buyerInfoBlock placeholder eksik' }
    }
    if (usesLegacyBuyerLine(trimmed)) {
      return { outdated: true, reason: 'eski tek satırlı alıcı/abone formatı' }
    }
  }

  return { outdated: false, reason: 'özel/uzun içerik — dokunulmayacak' }
}

function ensureBackupDir(): string {
  const dir = path.resolve(process.cwd(), 'backups', 'legal-documents')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function writeBackup(rows: BackupRow[]): string {
  const dir = ensureBackupDir()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(dir, `legal-documents-backup-${stamp}.json`)
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        recordCount: rows.length,
        records: rows,
      },
      null,
      2,
    ),
    'utf8',
  )
  return file
}

async function main() {
  const mode = parseMode(process.argv.slice(2))
  const apply = mode === 'apply'

  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL yok (.env)')
    process.exit(1)
  }

  const prisma = new PrismaClient()

  try {
    const allRows = await prisma.legalDocument.findMany({
      where: { type: { in: SYNC_TYPES } },
      orderBy: [{ type: 'asc' }, { updatedAt: 'desc' }],
    })

    console.log(`\n[legal:sync-defaults] Mod: ${mode.toUpperCase()}`)
    console.log(`Toplam LegalDocument kaydı (hedef tipler): ${allRows.length}`)

    const byType = new Map<LegalDocumentType, typeof allRows>()
    for (const row of allRows) {
      const list = byType.get(row.type) ?? []
      list.push(row)
      byType.set(row.type, list)
    }

    const planned: PlannedUpdate[] = []
    const backupTargets: BackupRow[] = []

    for (const type of SYNC_TYPES) {
      const rows = byType.get(type) ?? []
      const target = getTargetTemplate(type)

      if (rows.length === 0) {
        planned.push({
          id: '(yeni)',
          type,
          action: 'create',
          reason: 'kayıt yok — varsayılan oluşturulacak',
          currentLength: 0,
          newLength: target.content.length,
          newTitle: target.title,
        })
        continue
      }

      for (const row of rows) {
        const { outdated, reason } = assessContent(type, row.content)
        if (!outdated) {
          console.log(`  SKIP  ${type} [${row.id.slice(0, 8)}…] v${row.version} — ${reason}`)
          continue
        }

        planned.push({
          id: row.id,
          type,
          action: 'update',
          reason,
          currentLength: row.content.trim().length,
          newLength: target.content.length,
          newTitle: target.title,
          previousTitle: row.title,
          previousVersion: row.version,
        })
        backupTargets.push({
          id: row.id,
          type: row.type,
          title: row.title,
          content: row.content,
          version: row.version,
          isActive: row.isActive,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })
      }
    }

    const outdatedCount = planned.length
    console.log(`\nGüncellenecek / oluşturulacak kayıt: ${outdatedCount}`)

    if (outdatedCount === 0) {
      console.log('Tüm kayıtlar güncel; işlem gerekmiyor.')
      return
    }

    console.log('\nPlanlanan işlemler:')
    for (const p of planned) {
      console.log(
        `  ${p.action.toUpperCase().padEnd(6)} ${p.type} [${p.id}] — ${p.reason} (${p.currentLength} → ${p.newLength} karakter)`,
      )
    }

    if (!apply) {
      console.log('\nDry-run tamamlandı. Uygulamak için: npm run legal:sync-defaults -- --apply')
      return
    }

    const backupFile = writeBackup(backupTargets)
    console.log(`\nBackup: ${backupFile}`)

    let updated = 0
    let created = 0

    for (const p of planned) {
      const target = getTargetTemplate(p.type)
      if (p.action === 'create') {
        await prisma.legalDocument.create({
          data: {
            type: p.type,
            title: target.title,
            content: target.content,
            version: 1,
            isActive: true,
          },
        })
        created += 1
        console.log(`  CREATED ${p.type}`)
        continue
      }

      const row = await prisma.legalDocument.findUnique({ where: { id: p.id } })
      if (!row) {
        console.warn(`  WARN kayıt bulunamadı: ${p.id}`)
        continue
      }

      await prisma.legalDocument.update({
        where: { id: p.id },
        data: {
          title: target.title,
          content: target.content,
          version: Math.max(1, row.version + 1),
        },
      })
      updated += 1
      console.log(`  UPDATED ${p.type} [${p.id}] v${row.version} → v${row.version + 1}`)
    }

    console.log(`\nTamamlandı: ${updated} güncellendi, ${created} oluşturuldu.`)
    console.log(
      'Not: DIGITAL_IMMEDIATE_DELIVERY_WAIVER checkout/snapshot tarafında DOWNLOAD ve SAAS varyantları kod şablonlarından ayrı kullanılmaya devam eder.',
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
