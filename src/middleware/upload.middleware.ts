import multer from 'multer'
import path from 'path'
import { randomUUID } from 'crypto'
import { ensureUploadsDir, getUploadsDir } from '../services/media.service'

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    ensureUploadsDir()
    cb(null, getUploadsDir())
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname) || '.bin'
    cb(null, `${randomUUID()}${ext}`)
  },
})

export const uploadImage = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = /^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(file.mimetype)
    if (ok) cb(null, true)
    else cb(new Error('Sadece görsel dosyaları'))
  },
})
