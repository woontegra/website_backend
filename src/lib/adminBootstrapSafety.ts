import { isProductionEnv } from './requiredSecrets'

type Env = NodeJS.ProcessEnv

export const ADMIN_BOOTSTRAP_EMAIL = 'info@woontegra.com'

export function readAdminSeedPassword(env: Env = process.env): string {
  return String(env.ADMIN_SEED_PASSWORD ?? '').trim()
}

export function looksLikeProductionDatabaseUrl(url: string): boolean {
  const raw = String(url || '').trim().toLowerCase()
  if (!raw) return false
  return (
    raw.includes('rlwy.net') ||
    raw.includes('railway.internal') ||
    raw.includes('railway.app') ||
    raw.includes('.proxy.rlwy.net')
  )
}

export function destructiveSeedBlockReason(env: Env = process.env): string | null {
  if (isProductionEnv(env) || String(env.RAILWAY_ENVIRONMENT ?? '').trim().toLowerCase() === 'production') {
    return 'Destructive seed is disabled in production. No database writes were made.'
  }
  const dbUrl = String(env.DATABASE_URL ?? '').trim()
  if (looksLikeProductionDatabaseUrl(dbUrl) && env.ALLOW_DESTRUCTIVE_SEED !== '1') {
    return 'DATABASE_URL looks like Railway/production. Refusing destructive seed. No database writes were made.'
  }
  if (!readAdminSeedPassword(env)) {
    return 'ADMIN_SEED_PASSWORD is required for seed. No database writes were made.'
  }
  return null
}

export type EnsureAdminPlan =
  | { action: 'abort'; reason: string }
  | { action: 'create' }
  | { action: 'skip_existing' }
  | { action: 'overwrite' }

export function planEnsureAdmin(input: {
  password: string
  exists: boolean
  allowOverwrite: boolean
}): EnsureAdminPlan {
  if (!input.password.trim()) {
    return { action: 'abort', reason: 'ADMIN_SEED_PASSWORD is required. No database writes were made.' }
  }
  if (!input.exists) return { action: 'create' }
  if (input.allowOverwrite) return { action: 'overwrite' }
  return { action: 'skip_existing' }
}

export function readLocalAdminScriptCreds(
  env: Env = process.env,
  emailFallback = ADMIN_BOOTSTRAP_EMAIL,
): { ok: true; email: string; password: string } | { ok: false; error: string } {
  const email = String(env.ADMIN_EMAIL || env.ADMIN_SEED_EMAIL || emailFallback || '').trim()
  const password = String(env.ADMIN_SEED_PASSWORD || env.ADMIN_PASSWORD || '').trim()
  if (!email || !password) {
    return {
      ok: false,
      error: 'ADMIN_SEED_PASSWORD or ADMIN_PASSWORD is required. No HTTP login was sent.',
    }
  }
  return { ok: true, email, password }
}

export function readProductionAdminPushCreds(
  env: Env = process.env,
): { ok: true; apiUrl: string; email: string; password: string } | { ok: false; error: string } {
  const apiUrl = String(env.PROD_API_URL ?? '').trim()
  const email = String(env.ADMIN_EMAIL ?? '').trim()
  const password = String(env.ADMIN_PASSWORD || env.ADMIN_SEED_PASSWORD || '').trim()
  if (!apiUrl || !email || !password) {
    return {
      ok: false,
      error:
        'PROD_API_URL, ADMIN_EMAIL, and ADMIN_PASSWORD (or ADMIN_SEED_PASSWORD) are required. No HTTP login was sent.',
    }
  }
  return { ok: true, apiUrl, email, password }
}
