import * as posts from './post.service'

/** Public blog API — veritabanı (Post / PostCategory) */
export const blogService = {
  async listCategories() {
    return posts.listCategoriesPublic()
  },

  async listPosts(opts: { category?: string; status?: string }) {
    if (opts.status === 'draft') return []
    return posts.listPostsPublic({ categorySlug: opts.category })
  },

  async getBySlug(slug: string) {
    return posts.getPostBySlugPublic(slug)
  },

  async createPost(_data: { title: string; slug: string; excerpt?: string; body?: string; categoryId?: string }) {
    throw new Error('Blog oluşturma yalnızca admin API üzerinden')
  },
}
