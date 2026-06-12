import multer from 'multer'

const IMAGE = /^image\/(jpeg|jpg|png|webp|svg\+xml)$/
const PDF = /^application\/pdf$/
const ZIP = /^application\/(zip|x-zip-compressed)$/
const OCTET = /^application\/octet-stream$/
const MSI = /^application\/x-msi$/
const DMG = /^application\/x-apple-diskimage$/
const X_MS_DOWNLOAD = /^application\/x-msdownload$/

/** Mağaza medya: görsel, pdf, zip, exe/msi/dmg (octet-stream uzantı ile doğrulanır) */
export const uploadCatalog = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const m = file.mimetype.toLowerCase()
    if (IMAGE.test(m) || PDF.test(m) || ZIP.test(m) || MSI.test(m) || DMG.test(m) || X_MS_DOWNLOAD.test(m)) {
      cb(null, true)
      return
    }
    if (OCTET.test(m)) {
      const lower = (file.originalname || '').toLowerCase()
      if (/\.(exe|msi|dmg|zip)$/.test(lower)) {
        cb(null, true)
        return
      }
    }
    cb(new Error('Desteklenmeyen dosya türü (görsel, PDF, ZIP, EXE, MSI, DMG).'))
  },
})
