import { prisma } from '../lib/prisma'

/** Kayıt var ama içerik boşsa API’nin döndüreceği varsayılan HTML */
export const DEFAULT_EMPTY_PAGE_HTML = `<section class="hero">
  <h1>Woontegra</h1>
  <p>Yazılım ve teknoloji çözümleri</p>
</section>`

/** Veritabanında home satırı yokken kullanılacak içerik */
export const DEFAULT_HOME_WHEN_MISSING_HTML =
  '<h1>Woontegra</h1><p>Yazılım, SaaS ve e-ticaret çözümleri</p>'

export type PublicPagePayload = {
  slug: string
  title: string
  content: string
  status: string
}

export async function getPublishedPageRow(slug: string) {
  return prisma.page.findFirst({
    where: { slug, status: 'published' },
    select: {
      slug: true,
      title: true,
      content: true,
      status: true,
    },
  })
}

export function buildPublicPayload(row: {
  slug: string
  title: string
  content: string
  status: string
}): PublicPagePayload {
  const raw = (row.content ?? '').trim()
  const content = raw === '' ? DEFAULT_EMPTY_PAGE_HTML : raw
  return {
    slug: row.slug,
    title: row.title,
    content,
    status: row.status,
  }
}

/** GET /api/pages/:slug — yoksa home için sentetik; boş içerik → varsayılan HTML */
export async function resolvePublicPage(slug: string): Promise<PublicPagePayload | null> {
  const row = await getPublishedPageRow(slug)
  if (!row) {
    if (slug === 'home') {
      return {
        slug: 'home',
        title: 'Ana Sayfa',
        content: DEFAULT_HOME_WHEN_MISSING_HTML,
        status: 'published',
      }
    }
    return null
  }
  return buildPublicPayload(row)
}

export async function listPagesAdmin() {
  return prisma.page.findMany({
    orderBy: [{ updatedAt: 'desc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function getPageAdmin(id: string) {
  return prisma.page.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      content: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function createPage(data: { slug: string; title: string; content?: string; status?: string }) {
  const status = data.status === 'draft' ? 'draft' : 'published'
  return prisma.page.create({
    data: {
      slug: data.slug,
      title: data.title,
      content: data.content ?? '',
      status,
    },
  })
}

export async function updatePage(
  id: string,
  data: { slug?: string; title?: string; content?: string | null; status?: string }
) {
  const patch: Record<string, unknown> = {}
  if (data.slug !== undefined) patch.slug = data.slug
  if (data.title !== undefined) patch.title = data.title
  if (data.content !== undefined) patch.content = data.content ?? ''
  if (data.status !== undefined) patch.status = data.status === 'draft' ? 'draft' : 'published'
  return prisma.page.update({ where: { id }, data: patch })
}

export async function deletePage(id: string) {
  return prisma.page.delete({ where: { id } })
}
