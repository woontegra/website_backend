/**
 * Railway: DATABASE_URL bazen referansla gelmez; PGHOST / PGUSER / … ayrı değişken olarak gelir.
 * Geçersiz DATABASE_URL (sqlite, şemasız vb.) yok sayılır; DATABASE_PUBLIC_URL denenir.
 */
function trimUrl(v) {
  if (v == null || typeof v !== 'string') return ''
  let s = String(v).trim().replace(/^\uFEFF/, '')
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim()
  }
  return s
}

function isPostgresUrl(s) {
  if (!s) return false
  const t = s.trim().toLowerCase()
  return t.startsWith('postgresql://') || t.startsWith('postgres://')
}

/** Prisma için her zaman postgresql:// */
function normalizePostgresUrl(s) {
  if (!isPostgresUrl(s)) return null
  let u = trimUrl(s)
  if (u.toLowerCase().startsWith('postgres://')) {
    u = 'postgresql://' + u.slice('postgres://'.length)
  }
  return u
}

function resolveDatabaseUrl() {
  const tryKeys = [
    process.env.DATABASE_URL,
    process.env.DATABASE_PUBLIC_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_PRIVATE_URL,
    process.env.RAILWAY_DATABASE_URL,
  ]

  for (const raw of tryKeys) {
    const n = normalizePostgresUrl(raw)
    if (n && n.length > 18) return n
  }

  const host = process.env.PGHOST || process.env.POSTGRES_HOST
  const port = process.env.PGPORT || process.env.POSTGRES_PORT || '5432'
  const user = process.env.PGUSER || process.env.POSTGRES_USER
  const pass = process.env.PGPASSWORD ?? process.env.POSTGRES_PASSWORD ?? ''
  const db = process.env.PGDATABASE || process.env.POSTGRES_DB || process.env.POSTGRES_DATABASE

  if (host && user && db) {
    const u = encodeURIComponent(user)
    const p = encodeURIComponent(String(pass))
    let url = `postgresql://${u}:${p}@${host}:${port}/${db}`
    const isPublic =
      host.includes('proxy.rlwy.net') ||
      host.includes('rlwy.net') ||
      host.includes('railway.app')
    if (isPublic && !url.includes('sslmode=')) {
      url += url.includes('?') ? '&sslmode=require' : '?sslmode=require'
    }
    return url
  }

  return null
}

/** process.env.DATABASE_URL’yi geçerli Postgres URL ile yazar; yoksa null */
function applyToProcessEnv() {
  const url = resolveDatabaseUrl()
  if (url) {
    process.env.DATABASE_URL = url
    return url
  }
  const bad = trimUrl(process.env.DATABASE_URL)
  if (bad && !isPostgresUrl(bad)) {
    console.warn(
      '[db] DATABASE_URL postgresql:// ile başlamıyor; yok sayıldı. DATABASE_PUBLIC_URL ekleyin veya DATABASE_URL’yi düzeltin.'
    )
  }
  return null
}

module.exports = {
  resolveDatabaseUrl,
  applyToProcessEnv,
  trimUrl,
  normalizePostgresUrl,
  isPostgresUrl,
}
