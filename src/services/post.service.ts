import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

export async function listCategoriesPublic() {
  return prisma.postCategory.findMany({ orderBy: { name: 'asc' } })
}

export async function listCategoriesAdmin() {
  return prisma.postCategory.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { posts: true } } },
  })
}

export async function createCategory(data: { slug: string; name: string; description?: string | null }) {
  return prisma.postCategory.create({
    data: {
      slug: data.slug,
      name: data.name,
      description: data.description ?? undefined,
    },
  })
}

export async function updateCategory(
  id: string,
  data: { slug?: string; name?: string; description?: string | null }
) {
  return prisma.postCategory.update({ where: { id }, data })
}

export async function deleteCategory(id: string) {
  return prisma.postCategory.delete({ where: { id } })
}

export async function listPostsPublic(opts?: { categorySlug?: string }) {
  const where: Prisma.PostWhereInput = { status: 'published' }
  if (opts?.categorySlug) {
    where.category = { slug: opts.categorySlug }
  }
  return prisma.post.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    include: { category: true },
  })
}

export async function listPostsAdmin() {
  return prisma.post.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { category: true },
  })
}

export async function getPostBySlugPublic(slug: string) {
  return prisma.post.findFirst({
    where: { slug, status: 'published' },
    include: { category: true },
  })
}

export async function getPostAdmin(id: string) {
  return prisma.post.findUnique({
    where: { id },
    include: { category: true },
  })
}

export async function createPost(data: {
  slug: string
  title: string
  excerpt?: string | null
  bodyHtml?: string | null
  featuredImage?: string | null
  categoryId?: string | null
  status?: string
}) {
  const status = data.status ?? 'draft'
  return prisma.post.create({
    data: {
      slug: data.slug,
      title: data.title,
      excerpt: data.excerpt ?? undefined,
      bodyHtml: data.bodyHtml ?? undefined,
      featuredImage: data.featuredImage ?? undefined,
      categoryId: data.categoryId || undefined,
      status,
      publishedAt: status === 'published' ? new Date() : undefined,
    },
  })
}

export async function updatePost(
  id: string,
  data: {
    slug?: string
    title?: string
    excerpt?: string | null
    bodyHtml?: string | null
    featuredImage?: string | null
    categoryId?: string | null
    status?: string
  }
) {
  const d: Prisma.PostUpdateInput = {}
  if (data.slug !== undefined) d.slug = data.slug
  if (data.title !== undefined) d.title = data.title
  if (data.excerpt !== undefined) d.excerpt = data.excerpt
  if (data.bodyHtml !== undefined) d.bodyHtml = data.bodyHtml
  if (data.featuredImage !== undefined) d.featuredImage = data.featuredImage
  if (data.categoryId !== undefined) d.category = data.categoryId ? { connect: { id: data.categoryId } } : { disconnect: true }
  if (data.status !== undefined) {
    d.status = data.status
    if (data.status === 'published') {
      const cur = await prisma.post.findUnique({ where: { id }, select: { publishedAt: true } })
      if (!cur?.publishedAt) d.publishedAt = new Date()
    }
  }
  return prisma.post.update({ where: { id }, data: d })
}

export async function deletePost(id: string) {
  return prisma.post.delete({ where: { id } })
}
