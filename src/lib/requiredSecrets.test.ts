/**
 * Run: npx tsx --test src/lib/requiredSecrets.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import {
  PRODUCTION_JWT_SECRET_MISSING,
  assertProductionJwtSecret,
  getDownloadTokenSecret,
  getJwtSecret,
  isProductionEnv,
  productionJwtSecretError,
  readJwtSecret,
} from './requiredSecrets'

test('readJwtSecret trims and treats whitespace as empty', () => {
  assert.equal(readJwtSecret({ JWT_SECRET: '  abc  ' }), 'abc')
  assert.equal(readJwtSecret({ JWT_SECRET: '   ' }), '')
  assert.equal(readJwtSecret({}), '')
})

test('getJwtSecret throws without a real secret and never uses change-me-in-production', () => {
  assert.throws(() => getJwtSecret({}), /JWT_SECRET is required/)
  assert.throws(() => getJwtSecret({ JWT_SECRET: '  ' }), /JWT_SECRET is required/)
  assert.equal(getJwtSecret({ JWT_SECRET: 'live-secret' }), 'live-secret')
})

test('getDownloadTokenSecret prefers DOWNLOAD_TOKEN_SECRET then JWT_SECRET', () => {
  assert.equal(
    getDownloadTokenSecret({ DOWNLOAD_TOKEN_SECRET: 'dl-secret', JWT_SECRET: 'jwt-secret' }),
    'dl-secret',
  )
  assert.equal(getDownloadTokenSecret({ JWT_SECRET: 'jwt-secret' }), 'jwt-secret')
  assert.throws(() => getDownloadTokenSecret({}), /JWT_SECRET is required/)
})

test('production boot fails when JWT_SECRET is missing or blank', () => {
  assert.equal(isProductionEnv({ NODE_ENV: 'production' }), true)
  assert.equal(productionJwtSecretError({ NODE_ENV: 'production' }), PRODUCTION_JWT_SECRET_MISSING)
  assert.equal(productionJwtSecretError({ NODE_ENV: 'production', JWT_SECRET: '  ' }), PRODUCTION_JWT_SECRET_MISSING)
  assert.equal(productionJwtSecretError({ NODE_ENV: 'development' }), null)
  assert.equal(productionJwtSecretError({ NODE_ENV: 'production', JWT_SECRET: 'set' }), null)

  let exitCode: number | null = null
  assert.throws(
    () =>
      assertProductionJwtSecret({ NODE_ENV: 'production' }, ((code: number) => {
        exitCode = code
        throw new Error(`exit:${code}`)
      }) as (code: number) => never),
    /exit:1/,
  )
  assert.equal(exitCode, 1)

  assert.doesNotThrow(() =>
    assertProductionJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'set' }, (() => {
      throw new Error('must-not-exit')
    }) as (code: number) => never),
  )
})

test('production-like boot never reaches listen without JWT_SECRET, and does with a secret', () => {
  let listenReached = false
  const boot = (env: NodeJS.ProcessEnv) => {
    listenReached = false
    assertProductionJwtSecret(env, ((code: number) => {
      throw new Error(`exit:${code}`)
    }) as (code: number) => never)
    listenReached = true
  }

  assert.throws(() => boot({ NODE_ENV: 'production' }), /exit:1/)
  assert.equal(listenReached, false)

  assert.doesNotThrow(() => boot({ NODE_ENV: 'production', JWT_SECRET: 'production-like-secret' }))
  assert.equal(listenReached, true)
})

test('sign and verify use the same getJwtSecret value', () => {
  const env = { JWT_SECRET: 'shared-auth-secret' }
  const token = jwt.sign({ userId: 'u1', role: 'admin' }, getJwtSecret(env), { expiresIn: '1m' })
  const decoded = jwt.verify(token, getJwtSecret(env)) as { userId: string }
  assert.equal(decoded.userId, 'u1')
  assert.throws(() => jwt.verify(token, 'change-me-in-production'))
})
