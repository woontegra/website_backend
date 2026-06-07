import multer from 'multer'

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = /^image\/(jpeg|jpg|png|webp|gif|svg\+xml)$/.test(file.mimetype)
    if (ok) cb(null, true)
    else cb(new Error('Sadece görsel dosyaları'))
  },
})
