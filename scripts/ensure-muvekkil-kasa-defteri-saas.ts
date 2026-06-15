/**
 * "SaaS Hukuk Yazılımları" kategorisi ve slug `muvekkil-kasa-defteri-saas` ürününü ekler veya
 * metin / kategori / tip alanlarını günceller. **Fiyat** mevcut kayıtta korunur (yalnızca ilk
 * oluşturmada varsayılan fiyat yazılır).
 *
 *   cd backend && npm run ensure:kasa-saas
 */
import path from 'path'
import { config } from 'dotenv'
import { NavigationMenuItemType, Prisma, PrismaClient, ProductType } from '@prisma/client'

config({ path: path.resolve(process.cwd(), '.env') })
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.join(process.cwd(), 'scripts/resolve-database-url.cjs')).applyToProcessEnv()
} catch {
  /* */
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL yok (.env)')
  process.exit(1)
}

const CATEGORY_SLUG = 'saas-hukuk-yazilimlari'
const PRODUCT_SLUG = 'muvekkil-kasa-defteri-saas'

const SHORT_DESC =
  'Hukuk büroları için web tabanlı müvekkil, dosya, avans, masraf, vekalet taksiti ve SMM takip sistemi.'

const LONG_DESC =
  'Müvekkil Kasa Defteri SaaS; hukuk bürolarının müvekkil bazlı kasa hareketlerini, dosya masraflarını, avans girişlerini, vekalet ücreti taksitlerini, tahsilat makbuzlarını ve SMM durumlarını web üzerinden takip edebilmesi için geliştirilmiş çok kullanıcılı bir sistemdir.'

const FEATURE_BULLETS = [
  'Web tabanlı kullanım',
  'Çok kullanıcılı büro yapısı',
  'Müvekkil ve dosya takibi',
  'Avans ve masraf takibi',
  'Vekalet ücreti ve taksit yönetimi',
  'Kısmi ödeme desteği',
  'Tahsilat makbuzu',
  'SMM bekleyen tahsilat uyarıları',
  'Kullanıcı yetkilendirme',
  'Woontegra tarafından yönetilen lisans sistemi',
].join('\n')

/** Public menüde SaaS kategorisine giden bir öğe yoksa ekler (çoğunlukla Masaüstü / Mağaza alt menüsü). */
async function ensureNavigationLinkToSaasCategory(prisma: PrismaClient, categoryId: string) {
  const label = 'SaaS Hukuk Yazılımları'
  const existing = await prisma.navigationMenuItem.findFirst({
    where: { type: 'CATEGORY', categoryId },
  })
  if (existing) {
    await prisma.navigationMenuItem.update({
      where: { id: existing.id },
      data: { isActive: true, label, openInNewTab: false },
    })
    console.log(`Menü: mevcut "${label}" güncellendi (${existing.id}).`)
    return
  }

  const storeParent =
    (await prisma.navigationMenuItem.findFirst({
      where: {
        isActive: true,
        parentId: null,
        type: 'CUSTOM_URL',
        OR: [{ url: '/urunler' }, { url: { endsWith: '/urunler' } }],
      },
    })) ??
    (await prisma.navigationMenuItem.findFirst({
      where: {
        isActive: true,
        parentId: null,
        OR: [
          { label: { equals: 'Masaüstü araçlar', mode: 'insensitive' } },
          { label: { contains: 'Masaüstü', mode: 'insensitive' } },
        ],
      },
    }))

  const maxChild = storeParent
    ? await prisma.navigationMenuItem.aggregate({
        where: { parentId: storeParent.id },
        _max: { sortOrder: true },
      })
    : await prisma.navigationMenuItem.aggregate({
        where: { parentId: null },
        _max: { sortOrder: true },
      })

  const nextOrder = (maxChild._max.sortOrder ?? 0) + 1

  await prisma.navigationMenuItem.create({
    data: {
      label,
      type: NavigationMenuItemType.CATEGORY,
      categoryId,
      parentId: storeParent?.id ?? null,
      sortOrder: nextOrder,
      isActive: true,
      openInNewTab: false,
    },
  })
  console.log(
    storeParent
      ? `Menü: "${label}" → "${storeParent.label}" alt menüsüne eklendi (sıra ${nextOrder}).`
      : `Menü: "${label}" üst menüye eklendi (sıra ${nextOrder}).`,
  )
}

async function main() {
  const prisma = new PrismaClient()

  const category = await prisma.productCategory.upsert({
    where: { slug: CATEGORY_SLUG },
    create: {
      name: 'SaaS Hukuk Yazılımları',
      slug: CATEGORY_SLUG,
      description:
        'Web tabanlı hukuk bürosu yazılımları (SaaS, yıllık lisans). Vitrin: Web Tabanlı Hukuk Yazılımları / SaaS hukuk yazılımları.',
      isActive: true,
      sortOrder: 15,
    },
    update: {
      name: 'SaaS Hukuk Yazılımları',
      description:
        'Web tabanlı hukuk bürosu yazılımları (SaaS, yıllık lisans). Vitrin: Web Tabanlı Hukuk Yazılımları / SaaS hukuk yazılımları.',
      isActive: true,
    },
  })

  const existing = await prisma.product.findUnique({ where: { slug: PRODUCT_SLUG } })

  if (!existing) {
    await prisma.product.create({
      data: {
        name: 'Müvekkil Kasa Defteri SaaS',
        slug: PRODUCT_SLUG,
        productType: ProductType.SAAS,
        shortDescription: SHORT_DESC,
        description: LONG_DESC,
        price: new Prisma.Decimal(49999),
        currency: 'TRY',
        isActive: true,
        purchaseEnabled: true,
        licenseMonths: 12,
        featureBullets: FEATURE_BULLETS,
        isFeatured: false,
        sortOrder: 100,
        categoryId: category.id,
      },
    })
    console.log(`Oluşturuldu: ${PRODUCT_SLUG} (varsayılan fiyat 49999 TRY — panelden güncelleyin)`)
  } else {
    await prisma.product.update({
      where: { slug: PRODUCT_SLUG },
      data: {
        name: 'Müvekkil Kasa Defteri SaaS',
        productType: ProductType.SAAS,
        shortDescription: SHORT_DESC,
        description: LONG_DESC,
        licenseMonths: 12,
        featureBullets: FEATURE_BULLETS,
        categoryId: category.id,
        purchaseEnabled: true,
        isActive: true,
      },
    })
    console.log(`Güncellendi (fiyat korundu): ${PRODUCT_SLUG}`)
  }

  await ensureNavigationLinkToSaasCategory(prisma, category.id)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
