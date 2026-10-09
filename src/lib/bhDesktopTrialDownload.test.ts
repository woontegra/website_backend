import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bhDesktopTrialDownloadPath,
  readBhDesktopTrialDays,
  selectBhDesktopInstallerUrl,
  signBhDesktopTrialDownloadToken,
  verifyBhDesktopTrialDownloadToken,
} from './bhDesktopTrialDownload'
import { localDesktopTrialTargetError } from '../services/bhDesktopTrial.service'

test('installer selection stays on the requested platform and ignores raw public fields', () => {
  const row = {
    windowsDownloadUrl: 'https://downloads.example.test/bilirkisi-windows.exe',
    macosDownloadUrl: 'https://downloads.example.test/bilirkisi-macos.dmg',
    windowsTrialDays: 7,
    macosTrialDays: 7,
  }
  assert.equal(selectBhDesktopInstallerUrl(row, 'WINDOWS'), row.windowsDownloadUrl)
  assert.equal(selectBhDesktopInstallerUrl(row, 'MACOS'), row.macosDownloadUrl)
  assert.equal(selectBhDesktopInstallerUrl({ windowsDownloadUrl: 'http://insecure.example/a.exe' }, 'WINDOWS'), null)
  assert.equal(readBhDesktopTrialDays(row, 'WINDOWS'), 7)
  assert.equal(readBhDesktopTrialDays({ macosTrialDays: 0 }, 'MACOS'), 7)
})

test('published arm64 dmg is the macOS installer and does not replace the windows exe', () => {
  const macosDownloadUrl =
    'https://download.woontegra.com/downloads/bilirkisihesap/macos/Bilirkisi-Hesap-3.6.7-mac-arm64.dmg'
  const windowsDownloadUrl =
    'https://download.woontegra.com/downloads/bilirkisihesap/windows/Bilirkisi-Hesap-Setup-3.6.4.exe'
  const row = { windowsDownloadUrl, macosDownloadUrl }
  assert.equal(selectBhDesktopInstallerUrl(row, 'MACOS'), macosDownloadUrl)
  assert.equal(selectBhDesktopInstallerUrl(row, 'WINDOWS'), windowsDownloadUrl)
})

test('development trial calls refuse a non-local license server', () => {
  assert.equal(
    localDesktopTrialTargetError({ NODE_ENV: 'development', LICENSE_SERVER_URL: 'https://lisans.example.test' }),
    'Yerel deneme production lisans sunucusuna gönderilmez.',
  )
  assert.equal(
    localDesktopTrialTargetError({ NODE_ENV: 'development', LICENSE_SERVER_URL: 'http://127.0.0.1:4001' }),
    null,
  )
  assert.equal(
    localDesktopTrialTargetError({ NODE_ENV: 'production', LICENSE_SERVER_URL: 'https://lisans.example.test' }),
    null,
  )
})

test('windows setup exe yields a trial download path and the updater feed does not', () => {
  process.env.DOWNLOAD_TOKEN_SECRET = process.env.DOWNLOAD_TOKEN_SECRET || 'local-test-secret-local-test-secret'
  const setupUrl = 'https://downloads.example.test/Bilirkisi-Hesap-Setup-3.6.0.exe'
  const updaterUrl = 'https://updates.example.test/updates/bilirkisi-hesap/windows'
  assert.equal(selectBhDesktopInstallerUrl({ windowsDownloadUrl: setupUrl }, 'WINDOWS'), setupUrl)
  assert.equal(selectBhDesktopInstallerUrl({ windowsDownloadUrl: updaterUrl }, 'WINDOWS'), null)
  assert.equal(selectBhDesktopInstallerUrl({ windowsDownloadUrl: '' }, 'WINDOWS'), null)
  assert.equal(bhDesktopTrialDownloadPath('grant-1', 'WINDOWS', { windowsDownloadUrl: updaterUrl }), null)
  const path = bhDesktopTrialDownloadPath('grant-1', 'WINDOWS', { windowsDownloadUrl: setupUrl })
  assert.ok(path?.startsWith('/api/downloads/bh-desktop-trial/'))
  const token = decodeURIComponent(String(path).slice('/api/downloads/bh-desktop-trial/'.length))
  assert.equal(token.includes(setupUrl), false)
  assert.deepEqual(verifyBhDesktopTrialDownloadToken(token), { grantId: 'grant-1', platform: 'WINDOWS' })
})

test('trial download token does not carry the installer URL', () => {
  process.env.DOWNLOAD_TOKEN_SECRET = process.env.DOWNLOAD_TOKEN_SECRET || 'local-test-secret-local-test-secret'
  const raw = 'https://downloads.example.test/secret-installer.exe'
  const token = signBhDesktopTrialDownloadToken({ grantId: 'grant-1', platform: 'WINDOWS' })
  assert.equal(token.includes(raw), false)
  assert.equal(token.includes('downloads.example.test'), false)
  const payload = verifyBhDesktopTrialDownloadToken(token)
  assert.deepEqual(payload, { grantId: 'grant-1', platform: 'WINDOWS' })
  assert.equal(verifyBhDesktopTrialDownloadToken(token)?.platform, 'WINDOWS')
})
