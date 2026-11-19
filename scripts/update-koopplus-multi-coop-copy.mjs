/**
 * KoopPlus satış sayfası — adetli satış metinleri.
 * Önce yedek alır, sonra SADECE PageContent pageKey=productPages içindeki koopplus-product
 * bloğunun şu metinlerini günceller (başka ürüne / başka sayfaya dokunmaz):
 *  - Özellikler: "Çoklu Kooperatif Yönetimi" açıklaması
 *  - Neden: "Birden fazla kooperatifi ayrı yönetin" açıklaması
 *  - Bilgi: çoklu kooperatif başlık/açıklama
 *  - Lisans modeli: "Kooperatif başına lisans" maddesi + "Tek kullanıcı hesabı" maddesi
 *  - SSS: "Birden fazla kooperatifim var, nasıl satın alırım?"
 * {ilkFiyat} / {ekFiyat} yer tutucuları sayfada güncel fiyatlarla gösterilir.
 *
 * Çalıştırma: node scripts/update-koopplus-multi-coop-copy.mjs        (uygular)
 *             node scripts/update-koopplus-multi-coop-copy.mjs --dry  (sadece gösterir)
 */
import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups')
const PAGE_KEY = 'productPages'
const DRY = process.argv.includes('--dry')

const MULTI_FEATURE_DESC = 'Her kooperatif için ayrı lisans; hepsini tek hesaptan, birbirinden ayrı tutarak yönetin.'
const WHY_DESC = 'Her kooperatif ayrı lisanslıdır; tek hesaptan aralarında geçiş yapın, veriler birbirine karışmaz.'
const MULTI_INFO = {
  title: 'Birden fazla kooperatifiniz mi var?',
  description:
    'Her kooperatif için ayrı lisans alın, hepsini tek hesaptan yönetin. Ek kooperatifler daha uygun fiyatlıdır ({ekFiyat}/yıl). Satın alırken kooperatif sayısını seçmeniz yeterli; ilk kooperatifiniz otomatik açılır, diğerlerini KoopPlus içinden kendiniz açarsınız. Her kooperatifin verileri birbirinden ayrı tutulur.',
}
const LICENSE_POINT =
  'Her kooperatif için ayrı lisans: ilk kooperatif {ilkFiyat}/yıl, her ek kooperatif {ekFiyat}/yıl (KDV dahil)'
const ACCOUNT_POINT = 'Tek kullanıcı hesabıyla bütün kooperatiflerinize geçiş yapın'
const FAQ_ITEM = {
  question: 'Birden fazla kooperatifim var, nasıl satın alırım?',
  answer:
    'Satın alırken “Kaç kooperatif?” alanından sayıyı seçin. İlk kooperatif {ilkFiyat}, her ek kooperatif {ekFiyat} (yıllık, KDV dahil). Ödeme sonrası ilk kooperatifiniz otomatik açılır; kalan haklarınızı KoopPlus içinde Kooperatifler → “+ Yeni Kooperatif” ile kendiniz kullanırsınız. Zaten KoopPlus müşterisiyseniz ek kooperatif için bizimle iletişime geçin; ödemenizi alıp kooperatif hakkınızı hesabınıza tanımlarız.',
}

function findAllKoopPlusBlocks(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const n of node) findAllKoopPlusBlocks(n, out)
    return out
  }
  if (node.type === 'koopplus-product') out.push(node)
  for (const v of Object.values(node)) findAllKoopPlusBlocks(v, out)
  return out
}

function applyCopy(content) {
  const changes = []
  if (Array.isArray(content.features?.items)) {
    for (const item of content.features.items) {
      if (item?.title === 'Çoklu Kooperatif Yönetimi' && item.description !== MULTI_FEATURE_DESC) {
        item.description = MULTI_FEATURE_DESC
        changes.push('features: Çoklu Kooperatif Yönetimi')
      }
    }
  }
  if (Array.isArray(content.why?.items)) {
    for (const item of content.why.items) {
      if (item?.title === 'Birden fazla kooperatifi ayrı yönetin' && item.description !== WHY_DESC) {
        item.description = WHY_DESC
        changes.push('why: Birden fazla kooperatifi ayrı yönetin')
      }
    }
  }
  content.info = content.info || {}
  if (content.info.multiCoop?.title !== MULTI_INFO.title || content.info.multiCoop?.description !== MULTI_INFO.description) {
    content.info.multiCoop = { ...MULTI_INFO }
    changes.push('info.multiCoop')
  }
  content.license = content.license || {}
  const points = Array.isArray(content.license.points) ? [...content.license.points] : []
  const oldIdx = points.findIndex((p) => typeof p === 'string' && /kooperatif başına lisans/i.test(p))
  if (!points.includes(LICENSE_POINT)) {
    if (oldIdx >= 0) points[oldIdx] = LICENSE_POINT
    else points.splice(1, 0, LICENSE_POINT)
    changes.push('license: fiyat maddesi')
  }
  if (!points.includes(ACCOUNT_POINT)) {
    points.splice(points.indexOf(LICENSE_POINT) + 1, 0, ACCOUNT_POINT)
    changes.push('license: tek hesap maddesi')
  }
  content.license.points = points
  content.faq = content.faq || {}
  const faq = Array.isArray(content.faq.items) ? [...content.faq.items] : []
  const fIdx = faq.findIndex((i) => i?.question === FAQ_ITEM.question)
  if (fIdx < 0) {
    faq.unshift({ ...FAQ_ITEM })
    changes.push('faq: yeni soru')
  } else if (faq[fIdx].answer !== FAQ_ITEM.answer) {
    faq[fIdx] = { ...FAQ_ITEM }
    changes.push('faq: soru güncellendi')
  }
  content.faq.items = faq
  return changes
}

const prisma = new PrismaClient()

async function main() {
  const row = await prisma.pageContent.findUnique({ where: { pageKey: PAGE_KEY } })
  if (!row) throw new Error(`PageContent ${PAGE_KEY} bulunamadı`)
  const parsed = JSON.parse(row.content)

  const blocks = findAllKoopPlusBlocks(parsed)
  if (blocks.length === 0) throw new Error('koopplus-product bloğu bulunamadı')

  if (!DRY) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(BACKUP_DIR, `productPages-before-koopplus-multi-coop-copy-${stamp}.json`)
    fs.writeFileSync(backupPath, row.content, 'utf8')
    console.log('yedek:', backupPath)
  }

  const all = []
  for (const block of blocks) {
    const content = block.settings?.content
    if (!content || typeof content !== 'object') continue
    all.push(...applyCopy(content))
  }
  console.log(`koopplus blok sayısı: ${blocks.length}; değişiklikler:`, all.length ? all : 'yok')
  if (DRY || all.length === 0) return

  await prisma.pageContent.update({
    where: { pageKey: PAGE_KEY },
    data: { content: JSON.stringify(parsed), updatedAt: new Date() },
  })
  console.log('güncellendi: productPages / koopplus-product (yalnızca bu metinler)')
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
