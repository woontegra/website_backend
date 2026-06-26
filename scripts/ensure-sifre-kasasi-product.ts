/**
 * Eski frontend Şifre Kasası ücretsiz aracını V3 Product tablosuna aktarır; kapak görselini R2'ye yükler.
 *   npx tsx scripts/ensure-sifre-kasasi-product.ts
 */
import fs from 'fs'
import path from 'path'
import { config } from 'dotenv'
import { PrismaClient, ProductType } from '@prisma/client'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { getR2PublicBucketName, getR2S3Client, isR2PublicUploadConfigured } from '../src/lib/r2.client'
import { inferContentType, uploadPublicObject } from '../src/services/r2Upload.service'

config({ path: path.resolve(process.cwd(), '.env') })
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.join(process.cwd(), 'scripts/resolve-database-url.cjs')).applyToProcessEnv()
} catch {
  /* */
}

const prisma = new PrismaClient()
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const COVER_SOURCE = path.join(REPO_ROOT, 'frontend', 'src', 'assets', 'images', 'woontegra-sifre-kasasi-ekran.png')
const PRODUCT_SLUG = 'sifre-kasasi'
const R2_COVER_KEY = `products/${PRODUCT_SLUG}/cover.png`

const SETUP_DOWNLOAD_URL =
  'https://github.com/woontegra/website_frontend/releases/download/sifre-kasasi-v1.0.0/woontegra-sifre-kasasi-setup-1.0.0.exe'

const SHORT_DESC =
  'Giriş bilgilerinizi güvenli, düzenli ve kolay erişilebilir şekilde saklayın — ücretsiz Windows masaüstü aracı.'

const LONG_DESC = `Woontegra Şifre Kasası, avukatlık ve işletme ekipleri için geliştirilmiş ücretsiz bir Windows masaüstü uygulamasıdır.

Şifrelerinizi, giriş URL'lerinizi, kullanıcı adlarınızı ve notlarınızı Excel dosyaları yerine yerel ve şifreli bir kasada yönetin. Verileriniz bilgisayarınızda kalır; Woontegra sunucularına gönderilmez.

Kurulumlu ve portable sürümler mevcuttur. İndirme bağlantıları resmi Woontegra sitesi üzerinden sunulur.`

const FEATURE_BULLETS = [
  "Giriş URL'si, kullanıcı adı, şifre ve not saklama",
  'Kategori / klasör yönetimi',
  'Şifre göster / gizle ve panoya kopyalama',
  'Güçlü şifre üretici ve şifre gücü göstergesi',
  'Otomatik kilitleme',
  'Şifreli yedek alma ve geri yükleme',
  'Güvenli Excel ve tam Excel dışa aktarım',
  'Kurulumlu ve portable Windows sürümü',
  'Yerel çalışır — veriler cihazınızda şifreli saklanır',
].join('\n')

async function resolveCoverUrl(): Promise<string | null> {
  if (!fs.existsSync(COVER_SOURCE)) {
    console.warn('Kapak kaynağı bulunamadı:', COVER_SOURCE)
    return null
  }
  if (!isR2PublicUploadConfigured()) {
    console.warn('R2 yapılandırılmadı; kapak URL atlanıyor.')
    return null
  }

  const stat = fs.statSync(COVER_SOURCE)
  if (stat.size < 10_000) {
    console.warn('Kapak dosyası çok küçük, stub olabilir — atlanıyor.')
    return null
  }

  const client = getR2S3Client()
  const bucket = getR2PublicBucketName()
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: R2_COVER_KEY }))
    const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, '')
    if (base) {
      console.log('R2 kapak zaten var:', `${base}/${R2_COVER_KEY}`)
      return `${base}/${R2_COVER_KEY}`
    }
  } catch {
    /* upload */
  }

  const body = fs.readFileSync(COVER_SOURCE)
  const uploaded = await uploadPublicObject({
    objectKey: R2_COVER_KEY,
    body,
    contentType: inferContentType(COVER_SOURCE, 'image/png'),
  })
  console.log('R2 kapak yüklendi:', uploaded.publicUrl, `(${uploaded.size} bytes)`)
  return uploaded.publicUrl
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL yok (.env)')
    process.exit(1)
  }

  const coverUrl = await resolveCoverUrl()

  const data = {
    name: 'Woontegra Şifre Kasası',
    slug: PRODUCT_SLUG,
    productType: ProductType.DOWNLOAD,
    shortDescription: SHORT_DESC,
    description: LONG_DESC,
    price: 0,
    compareAtPrice: null,
    currency: 'TRY',
    isActive: true,
    purchaseEnabled: false,
    licenseMonths: 0,
    licenseRequired: false,
    licenseAppCode: 'SIFRE_KASASI_DESKTOP',
    featureBullets: FEATURE_BULLETS,
    isFeatured: true,
    sortOrder: 5,
    version: '1.0.0',
    coverImage: coverUrl,
    downloadUrl: SETUP_DOWNLOAD_URL,
    seoTitle: 'Woontegra Şifre Kasası | Ücretsiz Windows Şifre Yönetim Aracı',
    seoDescription:
      "Giriş URL'lerinizi, kullanıcı adlarınızı, şifrelerinizi ve notlarınızı yerel ve şifreli şekilde saklayabileceğiniz ücretsiz Windows masaüstü aracı.",
    categoryId: null as string | null,
  }

  const existing = await prisma.product.findUnique({ where: { slug: PRODUCT_SLUG } })
  if (existing) {
    await prisma.product.update({
      where: { id: existing.id },
      data: {
        ...data,
        coverImage: coverUrl ?? existing.coverImage,
      },
    })
    console.log('Güncellendi:', existing.id, PRODUCT_SLUG)
  } else {
    const created = await prisma.product.create({ data })
    console.log('Oluşturuldu:', created.id, PRODUCT_SLUG)
  }

  const row = await prisma.product.findUnique({ where: { slug: PRODUCT_SLUG } })
  console.log(JSON.stringify({ slug: row?.slug, isActive: row?.isActive, purchaseEnabled: row?.purchaseEnabled, price: row?.price, coverImage: row?.coverImage }, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => void prisma.$disconnect())
