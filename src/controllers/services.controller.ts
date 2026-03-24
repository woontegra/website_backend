import { Request, Response } from 'express'
import { servicesService } from '../services/services.service'

export async function getAll(_req: Request, res: Response) {
  try {
    const services = await servicesService.getAll()
    res.json({ success: true, data: services })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Hizmetler yüklenemedi', error })
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const service = await servicesService.getById(req.params.id)
    if (!service) {
      return res.status(404).json({ success: false, message: 'Hizmet bulunamadı' })
    }
    res.json({ success: true, data: service })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Hizmet yüklenemedi', error })
  }
}

export async function create(req: Request, res: Response) {
  try {
    const { title, description, icon } = req.body
    
    if (!title || !description || !icon) {
      return res.status(400).json({ success: false, message: 'Tüm alanlar zorunludur' })
    }

    const service = await servicesService.create({ title, description, icon })
    res.status(201).json({ success: true, data: service })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Hizmet oluşturulamadı', error })
  }
}

export async function update(req: Request, res: Response) {
  try {
    const { title, description, icon } = req.body
    const service = await servicesService.update(req.params.id, { title, description, icon })
    res.json({ success: true, data: service })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Hizmet güncellenemedi', error })
  }
}

export async function deleteService(req: Request, res: Response) {
  try {
    await servicesService.delete(req.params.id)
    res.json({ success: true, message: 'Hizmet silindi' })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Hizmet silinemedi', error })
  }
}
