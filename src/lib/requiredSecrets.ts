type Env = NodeJS.ProcessEnv

export function isProductionEnv(env: Env = process.env): boolean {
  return String(env.NODE_ENV ?? '').trim().toLowerCase() === 'production'
}

export function readJwtSecret(env: Env = process.env): string {
  return String(env.JWT_SECRET ?? '').trim()
}

/** Shared signing/verify secret. No hardcoded fallback. */
export function getJwtSecret(env: Env = process.env): string {
  const secret = readJwtSecret(env)
  if (!secret) {
    throw new Error('JWT_SECRET is required and must be a non-empty string')
  }
  return secret
}

/** Prefer DOWNLOAD_TOKEN_SECRET; otherwise the same JWT_SECRET used for auth. */
export function getDownloadTokenSecret(env: Env = process.env): string {
  const dedicated = String(env.DOWNLOAD_TOKEN_SECRET ?? '').trim()
  if (dedicated) return dedicated
  return getJwtSecret(env)
}

export const PRODUCTION_JWT_SECRET_MISSING =
  'JWT_SECRET missing or empty — refusing to start in production'

export function productionJwtSecretError(env: Env = process.env): string | null {
  if (!isProductionEnv(env)) return null
  if (readJwtSecret(env)) return null
  return PRODUCTION_JWT_SECRET_MISSING
}

/**
 * Production boot guard. Must run before HTTP listen.
 * Non-production: no-op (auth calls still require JWT_SECRET via getJwtSecret).
 */
export function assertProductionJwtSecret(
  env: Env = process.env,
  exitFn: (code: number) => never = process.exit as (code: number) => never,
): void {
  const error = productionJwtSecretError(env)
  if (!error) return
  console.error(`[startup] ${error}`)
  exitFn(1)
}
