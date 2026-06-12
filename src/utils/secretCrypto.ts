import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 16
const TAG_LEN = 16

function deriveKey(): Buffer {
  const raw = process.env.PAYMENT_ENCRYPTION_KEY || process.env.JWT_SECRET || 'woontegra-dev-key-change-me'
  return crypto.createHash('sha256').update(raw, 'utf8').digest()
}

/** AES-256-GCM; çıktı base64(iv+tag+ciphertext). */
export function encryptSecret(plain: string): string {
  if (!plain) return ''
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, deriveKey(), iv, { authTagLength: TAG_LEN })
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptSecret(blob: string): string {
  if (!blob) return ''
  const buf = Buffer.from(blob, 'base64')
  if (buf.length < IV_LEN + TAG_LEN + 1) return ''
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const enc = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = crypto.createDecipheriv(ALGO, deriveKey(), iv, { authTagLength: TAG_LEN })
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
