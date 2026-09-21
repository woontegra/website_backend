/**
 * Müvekkil Kasa Desktop public installer mapping — saf fonksiyon testi.
 * Çalıştır: npx tsx scripts/test-mk-desktop-public-installer.ts
 */
import assert from 'node:assert/strict'
import {
  isAutoUpdateDistributionUrl,
  isPublicWindowsSetupInstallerUrl,
  publicMuvekkilKasaDesktopInstallerFiles,
} from '../src/lib/muvekkilKasaDesktopProduct.js'

const SETUP_URL =
  'https://cdn.example.com/public/Woontegra-Muvekkil-Kasa-Defteri-Setup-0.1.11.exe'
const UPDATE_EXE = 'https://updates.woontegra.com/updates/muvekkil-kasa-defteri/windows/Setup.exe'
const YML_URL = 'https://updates.woontegra.com/updates/muvekkil-kasa-defteri/latest.yml'
const BLOCKMAP_URL = `${SETUP_URL}.blockmap`

{
  const files = publicMuvekkilKasaDesktopInstallerFiles({
    slug: 'muvekkil-kasa-defteri-yazilimi',
    licenseAppCode: 'MUVEKKIL_KASA_DESKTOP',
    downloadFiles: {
      files: [{ type: 'setup', label: 'Kurulum Sürümü', url: SETUP_URL, version: '0.1.11' }],
    },
  })
  assert.equal(files.length, 1)
  assert.equal(files[0]?.downloadPath, SETUP_URL)
  assert.equal(files[0]?.type, 'setup')
  assert.equal(files[0]?.filename, 'Woontegra-Muvekkil-Kasa-Defteri-Setup-0.1.11.exe')
}

{
  assert.equal(isAutoUpdateDistributionUrl(UPDATE_EXE), true)
  assert.equal(
    publicMuvekkilKasaDesktopInstallerFiles({
      slug: 'muvekkil-kasa-defteri-yazilimi',
      downloadFiles: { files: [{ type: 'setup', label: 'Kurulum', url: UPDATE_EXE }] },
    }).length,
    0,
    '/updates/ must be rejected',
  )
}

{
  assert.equal(isPublicWindowsSetupInstallerUrl(YML_URL), false)
  assert.equal(
    publicMuvekkilKasaDesktopInstallerFiles({
      slug: 'muvekkil-kasa-defteri-yazilimi',
      downloadFiles: { files: [{ type: 'setup', label: 'Feed', url: YML_URL }] },
    }).length,
    0,
    'latest.yml must be rejected',
  )
}

{
  assert.equal(isPublicWindowsSetupInstallerUrl(BLOCKMAP_URL), false)
  assert.equal(
    publicMuvekkilKasaDesktopInstallerFiles({
      slug: 'muvekkil-kasa-defteri-yazilimi',
      downloadFiles: { files: [{ type: 'setup', label: 'Blockmap', url: BLOCKMAP_URL }] },
    }).length,
    0,
    '.blockmap must be rejected',
  )
}

{
  assert.equal(
    publicMuvekkilKasaDesktopInstallerFiles({
      slug: 'muvekkil-kasa-defteri-yazilimi',
      downloadFiles: { files: [] },
    }).length,
    0,
  )
  assert.equal(
    publicMuvekkilKasaDesktopInstallerFiles({
      slug: 'koopplus',
      licenseAppCode: 'KOOPPLUS_DESKTOP',
      downloadFiles: { files: [{ type: 'setup', label: 'Kurulum', url: SETUP_URL }] },
    }).length,
    0,
    'KoopPlus must not receive MK public installer mapping',
  )
}

console.log('mk-desktop-public-installer tests: OK')
