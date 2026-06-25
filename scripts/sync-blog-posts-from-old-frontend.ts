/**
 * Eski frontend blog yazılarını V3 Post tablosuna aktarır; kapak görsellerini R2'ye yükler.
 *   npx tsx scripts/sync-blog-posts-from-old-frontend.ts
 */
import fs from 'fs'
import path from 'path'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { blogPostContent } from '../../frontend/src/data/blogPostContent'
import { getR2PublicBucketName, getR2S3Client, isR2PublicUploadConfigured } from '../src/lib/r2.client'
import { buildBlogCoverObjectKey, inferContentType, uploadPublicObject } from '../src/services/r2Upload.service'

config({ path: path.resolve(process.cwd(), '.env') })
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.join(process.cwd(), 'scripts/resolve-database-url.cjs')).applyToProcessEnv()
} catch {
  /* */
}

const prisma = new PrismaClient()
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const ASSETS = path.join(REPO_ROOT, 'frontend', 'src', 'assets', 'images')

type OldBlogMeta = {
  slug: string
  title: string
  excerpt: string
  category: string
  imageKey: string
  date: string
  status?: 'draft' | 'published'
}

const OLD_BLOG_POSTS: OldBlogMeta[] = [
  {
    slug: 'dijital-donusum-rehberi',
    title: 'Dijital Dönüşüm Rehberi: İşletmenizi Geleceğe Taşıyın',
    excerpt: 'Dijital dönüşüm sadece teknoloji değil, iş yapış şeklinizi değiştirmektir.',
    category: 'Dijital Büyüme',
    imageKey: 'digitalTransformation',
    date: '2026-03-20',
  },
  {
    slug: 'saas-urun-gelistirme-rehberi',
    title: 'SaaS Ürün Geliştirme Rehberi',
    excerpt: 'Başarılı bir SaaS ürünü geliştirmek için bilmeniz gereken temel adımlar.',
    category: 'SaaS',
    imageKey: 'saasGuide',
    date: '2026-03-15',
  },
  {
    slug: 'e-ticaret-optimizasyonu',
    title: 'E-Ticaret Optimizasyonu',
    excerpt: 'Dönüşüm oranlarını artırmak için uygulanabilir stratejiler.',
    category: 'E-Ticaret',
    imageKey: 'ecommerceOptimization',
    date: '2026-03-12',
  },
  {
    slug: 'marka-tescil-sureci',
    title: 'Marka Tescil Süreci',
    excerpt: 'Markanızı koruma altına almak için izlemeniz gereken adımlar.',
    category: 'Marka & Patent',
    imageKey: 'trademark',
    date: '2026-03-10',
  },
  {
    slug: 'modern-web-teknolojileri',
    title: 'Modern Web Teknolojileri',
    excerpt: 'Güncel web geliştirme araçları ve framework seçimi.',
    category: 'Yazılım',
    imageKey: 'webTech',
    date: '2026-03-08',
  },
  {
    slug: 'dijital-pazarlama-stratejileri',
    title: 'Dijital Pazarlama Stratejileri',
    excerpt: 'Online varlığınızı güçlendirmek için etkili yöntemler.',
    category: 'Dijital Büyüme',
    imageKey: 'digitalMarketing',
    date: '2026-03-05',
  },
  {
    slug: 'api-tasarimi-best-practices',
    title: 'API Tasarımı Best Practices',
    excerpt: 'Ölçeklenebilir ve güvenli API geliştirme prensipleri.',
    category: 'Yazılım',
    imageKey: 'apiDesign',
    date: '2026-03-03',
  },
  {
    slug: 'taslak-icerik-yonetimi-rehberi',
    title: 'Taslak İçerik Yönetimi Rehberi',
    excerpt: 'Bu yazı yalnızca taslak durumundadır ve public listede görünmemelidir.',
    category: 'Yazılım',
    imageKey: 'default',
    date: '2026-06-01',
    status: 'draft',
  },
]

/** Eski frontend runtime — gerçek bundled görseller (stub /images/blog/*.jpg değil). */
const COVER_FILE_BY_IMAGE_KEY: Record<string, string> = {
  digitalTransformation: 'hero-dashboard.jpg',
  saasGuide: 'hero-dashboard.jpg',
  ecommerceOptimization: 'e-ticaret.jpeg',
  trademark: 'hero-dashboard.jpg',
  webTech: 'hero-dashboard.jpg',
  digitalMarketing: 'hero-dashboard.jpg',
  apiDesign: 'hero-dashboard.jpg',
  default: 'hero-dashboard.jpg',
}

const CATEGORY_SLUG_BY_LABEL: Record<string, string> = {
  Yazılım: 'yazilim',
  'E-Ticaret': 'e-ticaret',
  SaaS: 'genel',
  'Marka & Patent': 'genel',
  'Dijital Büyüme': 'genel',
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase()
}

function bodyHtmlFor(slug: string, excerpt: string): string {
  const key = normalizeSlug(slug)
  const html = blogPostContent[key]?.trim()
  return html && html.length > 20 ? html : `<p>${excerpt}</p>`
}

function parseDate(value: string): Date | undefined {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

async function uploadCover(slug: string, imageKey: string): Promise<string | null> {
  if (!isR2PublicUploadConfigured()) {
    console.warn('[blog-sync] R2 yapılandırılmadı; kapak görseli atlanıyor:', slug)
    return null
  }

  const fileName = COVER_FILE_BY_IMAGE_KEY[imageKey] ?? COVER_FILE_BY_IMAGE_KEY.default
  const sourcePath = path.join(ASSETS, fileName)
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Kapak kaynağı yok: ${sourcePath}`)
  }

  const body = fs.readFileSync(sourcePath)
  if (body.length < 10_240) {
    throw new Error(`Kapak dosyası çok küçük (stub?): ${sourcePath} (${body.length} B)`)
  }

  const ext = path.extname(fileName).replace(/^\./, '') || 'jpg'
  const objectKey = buildBlogCoverObjectKey(slug, `cover.${ext}`)
  const uploaded = await uploadPublicObject({
    objectKey,
    body,
    contentType: inferContentType(`cover.${ext}`),
  })
  await getR2S3Client().send(
    new HeadObjectCommand({ Bucket: getR2PublicBucketName(), Key: uploaded.objectKey }),
  )
  return uploaded.publicUrl
}

async function main() {
  const categories = await prisma.postCategory.findMany()
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]))

  const results: Array<{ slug: string; action: 'created' | 'updated'; cover: string | null }> = []

  for (const meta of OLD_BLOG_POSTS) {
    const slug = normalizeSlug(meta.slug)
    const status = meta.status ?? 'published'
    const categorySlug = CATEGORY_SLUG_BY_LABEL[meta.category] ?? 'genel'
    const categoryId = categoryBySlug.get(categorySlug) ?? null
    const bodyHtml = bodyHtmlFor(slug, meta.excerpt)
    const publishedAt = status === 'published' ? parseDate(meta.date) ?? new Date() : null

    let featuredImage: string | null = null
    try {
      featuredImage = await uploadCover(slug, meta.imageKey)
    } catch (err) {
      console.warn(`[blog-sync] Kapak yüklenemedi (${slug}):`, err instanceof Error ? err.message : err)
    }

    const existing = await prisma.post.findUnique({ where: { slug } })
    const payload = {
      title: meta.title,
      excerpt: meta.excerpt,
      bodyHtml,
      featuredImage,
      categoryId,
      status,
      publishedAt: status === 'published' ? publishedAt : null,
    }

    if (existing) {
      await prisma.post.update({
        where: { id: existing.id },
        data: {
          ...payload,
          publishedAt:
            status === 'published'
              ? publishedAt ?? existing.publishedAt ?? new Date()
              : null,
        },
      })
      results.push({ slug, action: 'updated', cover: featuredImage })
      console.log(`Güncellendi: ${slug}`)
    } else {
      await prisma.post.create({
        data: {
          slug,
          ...payload,
          publishedAt: status === 'published' ? publishedAt ?? new Date() : undefined,
        },
      })
      results.push({ slug, action: 'created', cover: featuredImage })
      console.log(`Oluşturuldu: ${slug}`)
    }
  }

  const publicCount = await prisma.post.count({ where: { status: 'published' } })
  const adminCount = await prisma.post.count()

  console.log('\n--- Özet ---')
  console.log('Taşınan yazı:', results.length)
  console.log('Yayında:', publicCount)
  console.log('Admin toplam:', adminCount)
  console.log('Slug listesi:', results.map((r) => r.slug).join(', '))
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
