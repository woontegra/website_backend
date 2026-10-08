import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  BH_DESKTOP_DEMO_APPLICATION_SUBJECT,
  buildBilirkisiDesktopDemoApplicationMail,
  desktopDemoApplicationAction,
} from './bhDesktopDemoApplication'
import { selectBhDesktopInstallerUrl } from './bhDesktopTrialDownload'
import { readDesktopDemoProfile } from '../services/bhDesktopTrial.service'

const WINDOWS_INSTALLER =
  'https://download.woontegra.com/downloads/bilirkisihesap/windows/Bilirkisi-Hesap-Setup-3.6.3.exe'

test('demo application mail states the clock starts inside the program', () => {
  const mail = buildBilirkisiDesktopDemoApplicationMail({
    customerName: 'Ayşe Yılmaz',
    platformLabel: 'Windows',
    downloadUrl: WINDOWS_INSTALLER,
  })
  assert.equal(mail.subject, BH_DESKTOP_DEMO_APPLICATION_SUBJECT)
  assert.equal(mail.subject, 'Bilirkişi Hesap — 7 Günlük Ücretsiz Deneme')
  assert.match(mail.text, /başvurunuz alındı/)
  assert.match(mail.text, /programını indirebilirsiniz/)
  assert.match(mail.text, /demo hesabınızı oluşturup etkinleştirdiğiniz anda başlar/)
  assert.match(mail.text, new RegExp(WINDOWS_INSTALLER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(mail.text, /bitiş|Bitiş|lisans anahtar|aktivasyon/i)
  assert.doesNotMatch(mail.html, /bitiş|lisans anahtar|aktivasyon/i)
  assert.equal(mail.html.includes(WINDOWS_INSTALLER), true)
})

test('macos application mail uses the macOS label and does not invent an end date', () => {
  const macosUrl = 'https://download.woontegra.com/downloads/bilirkisihesap/macos/Bilirkisi-Hesap.dmg'
  const mail = buildBilirkisiDesktopDemoApplicationMail({
    customerName: 'Mehmet',
    platformLabel: 'macOS',
    downloadUrl: macosUrl,
  })
  assert.match(mail.text, /macOS programını indirebilirsiniz/)
  assert.equal(mail.text.includes(macosUrl), true)
  assert.equal(mail.text.includes('expires'), false)
})

test('a repeated application resends the download and does not consume a trial', () => {
  assert.equal(
    desktopDemoApplicationAction({ ok: true, alreadyUsed: false, alreadyRecorded: false }),
    'save-application',
  )
  assert.equal(
    desktopDemoApplicationAction({ ok: false, alreadyUsed: true, alreadyRecorded: false }),
    'resend-download',
  )
  assert.equal(
    desktopDemoApplicationAction({ ok: true, alreadyUsed: false, alreadyRecorded: true }),
    'resend-download',
  )
  assert.equal(
    desktopDemoApplicationAction({ ok: false, alreadyUsed: false, alreadyRecorded: false }),
    'profile-unavailable',
  )
})

test('the website form still requires the professional profile fields', () => {
  const missing = readDesktopDemoProfile({
    email: 'a@b.com',
    name: 'Ali',
    phone: '5551112233',
    isExpertWitness: false,
  })
  assert.equal(missing.ok, false)
  const saved = readDesktopDemoProfile({
    email: 'a@b.com',
    name: 'Ali Veli',
    phone: '05551112233',
    company: 'Ofis',
    professionGroup: 'Hukuk',
    isExpertWitness: true,
    expertiseAreas: [{ code: 'is', name: 'İş hukuku' }],
  })
  assert.equal(saved.ok, true)
  if (saved.ok) {
    assert.equal(saved.profile.professionGroup, 'Hukuk')
    assert.equal(saved.profile.expertiseAreas.length, 1)
  }
})

test('published Windows installer is accepted and an empty macOS address is not replaced', () => {
  assert.equal(
    selectBhDesktopInstallerUrl({ windowsDownloadUrl: WINDOWS_INSTALLER, macosDownloadUrl: null }, 'WINDOWS'),
    WINDOWS_INSTALLER,
  )
  assert.equal(
    selectBhDesktopInstallerUrl({ windowsDownloadUrl: WINDOWS_INSTALLER, macosDownloadUrl: null }, 'MACOS'),
    null,
  )
  assert.equal(
    selectBhDesktopInstallerUrl(
      { windowsDownloadUrl: 'https://updates.woontegra.com/updates/bilirkisi-hesap-desktop/windows/latest.yml' },
      'WINDOWS',
    ),
    null,
  )
})

test('the site trial handler does not open a license-server demo', () => {
  const source = fs.readFileSync(
    fileURLToPath(new URL('../services/bhDesktopTrial.service.ts', import.meta.url)),
    'utf8',
  )
  assert.equal(source.includes('requestBilirkisiDesktopTrial'), false)
  assert.equal(source.includes('reserveOnly'), false)
  assert.equal(source.includes('expiresAt'), false)
  assert.equal(source.includes('sendBilirkisiDesktopTrialMail'), false)
  assert.equal(source.includes('desktopDemoApplicationAction'), true)
  assert.equal(source.includes('sendBilirkisiDesktopInstallerMail'), true)
})
