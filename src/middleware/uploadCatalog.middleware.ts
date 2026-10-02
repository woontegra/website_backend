import multer from 'multer'

const IMAGE = /^image\/(jpeg|jpg|png|webp|avif|svg\+xml)$/
const PDF = /^application\/pdf$/
const ZIP = /^application\/(zip|x-zip-compressed)$/
const OCTET = /^application\/octet-stream$/
const MSI = /^application\/x-msi$/
const DMG = /^application\/x-apple-diskimage$/
const X_MS_DOWNLOAD = /^application\/x-msdownload$/
const HERO_VIDEO = /^video\/(mp4|webm)$/

/** Görsel, kurulum dosyası ve hero videosu. 144 MB MP4 bu sınırın altında kalır. */
export const CATALOG_UPLOAD_MAX_BYTES = 200 * 1024 * 1024

/** Mağaza medya: görsel, pdf, zip, exe/msi/dmg, mp4/webm */
export const uploadCatalog = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CATALOG_UPLOAD_MAX_BYTES },
  fileFilter(_req, file, cb) {
    const m = file.mimetype.toLowerCase()
    if (
      IMAGE.test(m) ||
      PDF.test(m) ||
      ZIP.test(m) ||
      MSI.test(m) ||
      DMG.test(m) ||
      X_MS_DOWNLOAD.test(m) ||
      HERO_VIDEO.test(m)
    ) {
      cb(null, true)
      return
    }
    if (OCTET.test(m) || m === '') {
      const lower = (file.originalname || '').toLowerCase()
      if (/\.(exe|msi|dmg|zip|mp4|webm)$/.test(lower)) {
        cb(null, true)
        return
      }
    }
    cb(new Error('Desteklenmeyen dosya türü (görsel, PDF, ZIP, EXE, MSI, DMG, MP4, WebM).'))
  },
})
