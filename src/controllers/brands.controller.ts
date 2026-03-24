import { Request, Response } from 'express'
import { brandsService } from '../services/brands.service'

export async function getAll(_req: Request, res: Response) {
  try {
    const brands = await brandsService.getAll()
    res.json({ success: true, data: brands })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Markalar yüklenemedi', error })
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const brand = await brandsService.getById(req.params.id)
    if (!brand) {
      return res.status(404).json({ success: false, message: 'Marka bulunamadı' })
    }
    res.json({ success: true, data: brand })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Marka yüklenemedi', error })
  }
}

export async function create(req: Request, res: Response) {
  try {
    const { name, description, image, url } = req.body
    
    if (!name || !image) {
      return res.status(400).json({ success: false, message: 'İsim ve resim zorunludur' })
    }

    const brand = await brandsService.create({ name, description, image, url })
    res.status(201).json({ success: true, data: brand })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Marka oluşturulamadı', error })
  }
}

export async function update(req: Request, res: Response) {
  try {
    const { name, description, image, url } = req.body
    const brand = await brandsService.update(req.params.id, { name, description, image, url })
    res.json({ success: true, data: brand })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Marka güncellenemedi', error })
  }
}

export async function deleteBrand(req: Request, res: Response) {
  try {
    await brandsService.delete(req.params.id)
    res.json({ success: true, message: 'Marka silindi' })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Marka silinemedi', error })
  }
}
