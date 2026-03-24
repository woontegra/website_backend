import { Request, Response } from 'express'
import { contactMessagesService } from '../services/contact-messages.service'

export async function getAll(_req: Request, res: Response) {
  try {
    const messages = await contactMessagesService.getAll()
    res.json({ success: true, data: messages })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Mesajlar yüklenemedi', error })
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const message = await contactMessagesService.getById(req.params.id)
    if (!message) {
      return res.status(404).json({ success: false, message: 'Mesaj bulunamadı' })
    }
    res.json({ success: true, data: message })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Mesaj yüklenemedi', error })
  }
}

export async function create(req: Request, res: Response) {
  try {
    const { name, email, message, phone, company } = req.body
    
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'İsim, email ve mesaj zorunludur' })
    }

    const contactMessage = await contactMessagesService.create({ 
      name, 
      email, 
      message, 
      phone, 
      company 
    })
    res.status(201).json({ success: true, data: contactMessage })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Mesaj gönderilemedi', error })
  }
}

export async function markAsRead(req: Request, res: Response) {
  try {
    const message = await contactMessagesService.markAsRead(req.params.id)
    res.json({ success: true, data: message })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Mesaj güncellenemedi', error })
  }
}

export async function deleteMessage(req: Request, res: Response) {
  try {
    await contactMessagesService.delete(req.params.id)
    res.json({ success: true, message: 'Mesaj silindi' })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Mesaj silinemedi', error })
  }
}
