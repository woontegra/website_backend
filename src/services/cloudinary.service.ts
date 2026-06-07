import { v2 as cloudinary } from 'cloudinary'
import path from 'path'

const UPLOAD_FOLDER = process.env.CLOUDINARY_FOLDER?.trim() || 'woontegra'

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  )
}

function ensureConfigured(): void {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary yapılandırması eksik')
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  })
}

export async function uploadImageBuffer(
  buffer: Buffer,
  originalName: string,
): Promise<{ secureUrl: string; publicId: string }> {
  ensureConfigured()

  const baseName = path
    .basename(originalName, path.extname(originalName))
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .toLowerCase()

  const result = await new Promise<{
    secure_url: string
    public_id: string
  }>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: UPLOAD_FOLDER,
        public_id: `${baseName}-${Date.now()}`,
        resource_type: 'image',
        overwrite: false,
      },
      (error, uploadResult) => {
        if (error || !uploadResult) {
          reject(error ?? new Error('Cloudinary yükleme başarısız'))
          return
        }
        resolve({
          secure_url: uploadResult.secure_url,
          public_id: uploadResult.public_id,
        })
      },
    )

    uploadStream.end(buffer)
  })

  return {
    secureUrl: result.secure_url,
    publicId: result.public_id,
  }
}

export async function deleteByUrl(url: string): Promise<void> {
  if (!url.includes('cloudinary.com') || !isCloudinaryConfigured()) return

  ensureConfigured()

  const marker = '/upload/'
  const idx = url.indexOf(marker)
  if (idx === -1) return

  const afterUpload = url.slice(idx + marker.length)
  const withoutVersion = afterUpload.replace(/^v\d+\//, '')
  const publicId = withoutVersion.replace(/\.[a-zA-Z0-9]+$/, '')

  if (!publicId) return

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' })
  } catch (error) {
    console.error('[Cloudinary] Silme hatası:', error)
  }
}
