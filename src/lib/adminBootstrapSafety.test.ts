/**
 * Run: npx tsx --test src/lib/adminBootstrapSafety.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import {
  destructiveSeedBlockReason,
  looksLikeProductionDatabaseUrl,
  planEnsureAdmin,
  readLocalAdminScriptCreds,
  readProductionAdminPushCreds,
} from './adminBootstrapSafety'

const REPO_ROOT = path.resolve(__dirname, '../..')
const FALLBACK_LITERAL = 'Admin123!'

function readRepo(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8')
}

test('destructive seed refuses production before any wipe', () => {
  assert.match(
    destructiveSeedBlockReason({ NODE_ENV: 'production', ADMIN_SEED_PASSWORD: 'x', DATABASE_URL: 'postgresql://localhost/db' }) || '',
    /disabled in production/,
  )
  assert.match(
    destructiveSeedBlockReason({
      NODE_ENV: 'development',
      RAILWAY_ENVIRONMENT: 'production',
      ADMIN_SEED_PASSWORD: 'x',
      DATABASE_URL: 'postgresql://localhost/db',
    }) || '',
    /disabled in production/,
  )
})

test('destructive seed refuses Railway-like DATABASE_URL without opt-in', () => {
  assert.equal(looksLikeProductionDatabaseUrl('postgresql://postgres:x@host.proxy.rlwy.net:1234/railway'), true)
  assert.match(
    destructiveSeedBlockReason({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:x@xxx.proxy.rlwy.net:1234/railway',
      ADMIN_SEED_PASSWORD: 'local-only',
    }) || '',
    /Railway\/production/,
  )
  assert.equal(
    destructiveSeedBlockReason({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:x@localhost:5432/woontegra',
      ADMIN_SEED_PASSWORD: 'local-only',
    }),
    null,
  )
})

test('destructive seed refuses missing ADMIN_SEED_PASSWORD and has no Admin123 fallback', () => {
  assert.match(
    destructiveSeedBlockReason({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:x@localhost:5432/woontegra',
    }) || '',
    /ADMIN_SEED_PASSWORD is required/,
  )
})

test('ensure-admin never overwrites existing password without opt-in', () => {
  assert.equal(planEnsureAdmin({ password: '', exists: false, allowOverwrite: false }).action, 'abort')
  assert.equal(planEnsureAdmin({ password: 'new-pass', exists: false, allowOverwrite: false }).action, 'create')
  assert.equal(planEnsureAdmin({ password: 'new-pass', exists: true, allowOverwrite: false }).action, 'skip_existing')
  assert.equal(planEnsureAdmin({ password: 'new-pass', exists: true, allowOverwrite: true }).action, 'overwrite')
})

test('local sync scripts require a password and do not default Admin123!', () => {
  assert.equal(readLocalAdminScriptCreds({}).ok, false)
  const ok = readLocalAdminScriptCreds({ ADMIN_SEED_PASSWORD: 'local-pass' })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.password, 'local-pass')
})

test('production push requires explicit host + email + password (no defaults)', () => {
  assert.equal(readProductionAdminPushCreds({}).ok, false)
  assert.equal(
    readProductionAdminPushCreds({
      PROD_API_URL: 'https://example.up.railway.app',
      ADMIN_EMAIL: 'ops@example.com',
    }).ok,
    false,
  )
  const ok = readProductionAdminPushCreds({
    PROD_API_URL: 'https://example.up.railway.app',
    ADMIN_EMAIL: 'ops@example.com',
    ADMIN_PASSWORD: 'from-env-only',
  })
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.equal(ok.apiUrl, 'https://example.up.railway.app')
    assert.equal(ok.email, 'ops@example.com')
    assert.equal(ok.password, 'from-env-only')
  }
})

test('bootstrap sources refuse Admin123! fallback and seed guards before deleteMany', () => {
  const seed = readRepo('prisma/seed.ts')
  const ensureAdmin = readRepo('scripts/ensure-admin.ts')
  const push = readRepo('scripts/push-bh-module-pages-to-production.mjs')
  const saas = readRepo('scripts/test-saas-admin-safe.cjs')
  const readme = readRepo('README.md')
  assert.equal(seed.includes(FALLBACK_LITERAL), false)
  assert.equal(ensureAdmin.includes(FALLBACK_LITERAL), false)
  assert.equal(push.includes(FALLBACK_LITERAL), false)
  assert.equal(saas.includes(FALLBACK_LITERAL), false)
  assert.equal(readme.includes(FALLBACK_LITERAL), false)
  assert.equal(readRepo('scripts/sync-about-hero-asset.ts').includes(FALLBACK_LITERAL), false)
  assert.equal(readRepo('scripts/sync-service-hero-assets.ts').includes(FALLBACK_LITERAL), false)
  assert.equal(readRepo('scripts/sync-real-branding-assets.ts').includes(FALLBACK_LITERAL), false)
  assert.ok(ensureAdmin.includes('Password left unchanged') || ensureAdmin.includes('skip_existing'))
  assert.match(ensureAdmin, /console\.log\(`\[admin:ensure]/)
  assert.equal(ensureAdmin.includes('${PASS}'), false)
  const guardIdx = seed.indexOf('destructiveSeedBlockReason')
  const wipeIdx = seed.indexOf('deleteMany')
  assert.ok(guardIdx >= 0 && wipeIdx > guardIdx, 'seed must refuse before any deleteMany')
  assert.ok(push.includes('No HTTP login was sent'))
  assert.ok(!push.includes('websitebackend-production-ab6e.up.railway.app'))
})
