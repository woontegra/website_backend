import { S3Client } from '@aws-sdk/client-s3'

export type R2ConfigStatus = {
  configured: boolean
  publicUploadConfigured: boolean
  partiallyConfigured: boolean
  publicBucket: string | null
  privateBucket: string | null
  publicBaseUrl: string | null
  accountIdPresent: boolean
  endpointPresent: boolean
}

function missingEnvKeys(keys: readonly string[]): string[] {
  return keys.filter((k) => !readEnv(k))
}

/** Public medya/logo/hero yüklemesi için zorunlu ortam değişkenleri. */
export const R2_PUBLIC_UPLOAD_ENV_KEYS = [
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_ENDPOINT',
  'R2_PUBLIC_BUCKET_NAME',
  'R2_PUBLIC_BASE_URL',
] as const

const R2_FULL_ENV_KEYS = [
  'R2_ACCOUNT_ID',
  ...R2_PUBLIC_UPLOAD_ENV_KEYS,
  'R2_PRIVATE_BUCKET_NAME',
] as const

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim()
}

export function getR2PublicBucketName(): string {
  return readEnv('R2_PUBLIC_BUCKET_NAME') || 'woontegra-media'
}

export function getR2PrivateBucketName(): string {
  return readEnv('R2_PRIVATE_BUCKET_NAME') || 'woontegra-downloads'
}

export function getR2PublicBaseUrl(): string {
  return readEnv('R2_PUBLIC_BASE_URL').replace(/\/+$/, '')
}

export function getR2ConfigStatus(): R2ConfigStatus {
  const values = Object.fromEntries(R2_FULL_ENV_KEYS.map((k) => [k, readEnv(k)])) as Record<
    (typeof R2_FULL_ENV_KEYS)[number],
    string
  >
  const presentCount = R2_FULL_ENV_KEYS.filter((k) => Boolean(values[k])).length
  const configured = presentCount === R2_FULL_ENV_KEYS.length
  const publicUploadConfigured = missingEnvKeys(R2_PUBLIC_UPLOAD_ENV_KEYS).length === 0
  const partiallyConfigured = presentCount > 0 && !publicUploadConfigured

  return {
    configured,
    publicUploadConfigured,
    partiallyConfigured,
    publicBucket: values.R2_PUBLIC_BUCKET_NAME || null,
    privateBucket: values.R2_PRIVATE_BUCKET_NAME || null,
    publicBaseUrl: values.R2_PUBLIC_BASE_URL || null,
    accountIdPresent: Boolean(values.R2_ACCOUNT_ID),
    endpointPresent: Boolean(values.R2_ENDPOINT),
  }
}

export function isR2PublicUploadConfigured(): boolean {
  return getR2ConfigStatus().publicUploadConfigured
}

export function isR2Configured(): boolean {
  return getR2ConfigStatus().configured
}

export function assertR2PublicUploadConfigured(): void {
  const missing = missingEnvKeys(R2_PUBLIC_UPLOAD_ENV_KEYS)
  if (missing.length === 0) return
  throw new Error(`R2 medya yükleme yapılandırması eksik: ${missing.join(', ')}`)
}

let cachedClient: S3Client | null = null

export function getR2S3Client(): S3Client {
  assertR2PublicUploadConfigured()

  if (!cachedClient) {
    cachedClient = new S3Client({
      region: 'auto',
      endpoint: readEnv('R2_ENDPOINT'),
      credentials: {
        accessKeyId: readEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: readEnv('R2_SECRET_ACCESS_KEY'),
      },
    })
  }

  return cachedClient
}

/** Private bucket signed URL üretimi sonraki fazda kullanılacak. */
export function assertR2PrivateBucketReady(): void {
  const status = getR2ConfigStatus()
  if (!status.configured) {
    throw new Error('R2 private bucket yapılandırması hazır değil.')
  }
}
