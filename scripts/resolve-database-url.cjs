/**
 * Railway: DATABASE_URL bazen referansla gelmez; PGHOST / PGUSER / … ayrı değişken olarak gelir.
 * Bu dosya tek bir postgresql:// URL üretir.
 */
function resolveDatabaseUrl() {
  const direct = process.env.DATABASE_URL?.trim()
  if (direct) return direct

  const aliases = ['POSTGRES_URL', 'DATABASE_PRIVATE_URL', 'RAILWAY_DATABASE_URL']
  for (const k of aliases) {
    const v = process.env[k]?.trim()
    if (v) return v
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

/** process.env.DATABASE_URL yoksa çözülen URL’yi yazar; dönüş: kullanılan URL veya null */
function applyToProcessEnv() {
  const url = resolveDatabaseUrl()
  if (url) process.env.DATABASE_URL = url
  return url
}

module.exports = { resolveDatabaseUrl, applyToProcessEnv }
