import type { Request, Response } from 'express'
import * as posts from '../services/post.service'

export async function adminListCategories(_req: Request, res: Response) {
  try {
    const data = await posts.listCategoriesAdmin()
    res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'Sunucu hatası' })
  }
}

export async function adminCreateCategory(req: Request, res: Response) {
  try {
    const { slug, name, description } = req.body
    if (!slug || !name) return res.status(400).json({ success: false, message: 'slug ve name gerekli' })
    const data = await posts.createCategory({ slug, name, description })
    res.status(201).json({ success: true, data })
  } catch (e: unknown) {
    const dup = e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002'
    res.status(400).json({ success: false, message: dup ? 'Bu slug kullanılıyor' : 'Oluşturulamadı' })
  }
}

export async function adminUpdateCategory(req: Request, res: Response) {
  try {
    const data = await posts.updateCategory(req.params.id, req.body)
    res.json({ success: true, data })
  } catch {
    res.status(400).json({ success: false, message: 'Güncellenemedi' })
  }
}

export async function adminDeleteCategory(req: Request, res: Response) {
  try {
    await posts.deleteCategory(req.params.id)
    res.json({ success: true })
  } catch {
    res.status(400).json({ success: false, message: 'Silinemedi' })
  }
}

export async function adminListPosts(_req: Request, res: Response) {
  try {
    const data = await posts.listPostsAdmin()
    res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: 'Sunucu hatası' })
  }
}

export async function adminGetPost(req: Request, res: Response) {
  try {
    const data = await posts.getPostAdmin(req.params.id)
    if (!data) return res.status(404).json({ success: false, message: 'Yazı yok' })
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, message: 'Sunucu hatası' })
  }
}

export async function adminCreatePost(req: Request, res: Response) {
  try {
    const { slug, title, excerpt, bodyHtml, featuredImage, categoryId, status } = req.body
    if (!slug || !title) return res.status(400).json({ success: false, message: 'slug ve title gerekli' })
    const data = await posts.createPost({
      slug,
      title,
      excerpt,
      bodyHtml,
      featuredImage,
      categoryId,
      status,
    })
    res.status(201).json({ success: true, data })
  } catch (e: unknown) {
    const dup = e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002'
    res.status(400).json({ success: false, message: dup ? 'Bu slug kullanılıyor' : 'Oluşturulamadı' })
  }
}

export async function adminUpdatePost(req: Request, res: Response) {
  try {
    const data = await posts.updatePost(req.params.id, req.body)
    res.json({ success: true, data })
  } catch {
    res.status(400).json({ success: false, message: 'Güncellenemedi' })
  }
}

export async function adminDeletePost(req: Request, res: Response) {
  try {
    await posts.deletePost(req.params.id)
    res.json({ success: true })
  } catch {
    res.status(400).json({ success: false, message: 'Silinemedi' })
  }
}
