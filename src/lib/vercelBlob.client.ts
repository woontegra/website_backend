export const BLOB_READ_WRITE_TOKEN_ENV = 'BLOB_READ_WRITE_TOKEN'

/** Bazı panellerde alternatif isimle tanımlanabiliyor */
const BLOB_TOKEN_ALIASES = [
  BLOB_READ_WRITE_TOKEN_ENV,
  'VERCEL_BLOB_READ_WRITE_TOKEN',
  'BLOB_TOKEN',
] as const

export const VERCEL_BLOB_BUCKET_MARKER = 'vercel-blob'

export type VercelBlobConfigStatus = {
  configured: boolean
  tokenPresent: boolean
  /** Hangi env anahtarından okundu (değer asla loglanmaz) */
  tokenEnvKey: string | null
}

function readTokenFromEnv(): { token: string; envKey: string } | null {
  for (const key of BLOB_TOKEN_ALIASES) {
    const value = process.env[key]?.trim()
    if (value) return { token: value, envKey: key }
  }
  return null
}

export function getVercelBlobConfigStatus(): VercelBlobConfigStatus {
  const resolved = readTokenFromEnv()
  return {
    configured: Boolean(resolved),
    tokenPresent: Boolean(resolved),
    tokenEnvKey: resolved?.envKey ?? null,
  }
}

export function isVercelBlobConfigured(): boolean {
  return getVercelBlobConfigStatus().configured
}

export function assertVercelBlobConfigured(): void {
  if (!isVercelBlobConfigured()) {
    throw new Error(
      `${BLOB_READ_WRITE_TOKEN_ENV} tanımlı değil. Website medya yüklemesi için Railway/Vercel ortamına Blob Read/Write token ekleyin (Vercel Dashboard → Storage → Blob).`,
    )
  }
}

export function readBlobToken(): string {
  const resolved = readTokenFromEnv()
  if (!resolved) {
    assertVercelBlobConfigured()
  }
  return resolved!.token
}
