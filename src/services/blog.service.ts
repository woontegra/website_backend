import crypto from 'crypto'

const categories: Array<{ id: string; name: string }> = [
  { id: '1', name: 'Yazılım' },
  { id: '2', name: 'E-Ticaret' },
  { id: '3', name: 'Marka Tescil' },
]
const posts: Array<{
  id: string
  slug: string
  title: string
  excerpt: string
  body?: string
  categoryId: string
  status: string
  createdAt: Date
}> = []

export const blogService = {
  async listCategories() {
    return categories
  },
  async listPosts(_opts: { category?: string; status?: string }) {
    return posts
  },
  async getBySlug(slug: string) {
    return posts.find((p) => p.slug === slug) ?? null
  },
  async createPost(data: { title: string; slug: string; excerpt?: string; body?: string; categoryId?: string }) {
    const id = crypto.randomUUID()
    const record = {
      id,
      title: data.title,
      slug: data.slug,
      excerpt: data.excerpt ?? '',
      body: data.body,
      categoryId: data.categoryId ?? categories[0]?.id ?? '',
      status: 'draft',
      createdAt: new Date(),
    }
    posts.push(record)
    return record
  },
}
