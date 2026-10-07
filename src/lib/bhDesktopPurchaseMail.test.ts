import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BH_WINDOWS_INSTALLER_BUTTON_LABEL,
  bhWindowsPurchaseInstallerMail,
  resolveBilirkisiWindowsPurchaseInstallerUrl,
} from './bhDesktopPurchaseMail'

const setupUrl = 'https://download.example.test/downloads/bilirkisi-hesap/windows/Bilirkisi-Hesap-Setup-3.6.2.exe'
const updaterUrl = 'https://updates.woontegra.com/updates/bilirkisi-hesap-desktop/windows/latest.yml'

test('Windows satın alma maili admin kurulum adresini kullanır', () => {
  const url = resolveBilirkisiWindowsPurchaseInstallerUrl('license:BILIRKISI_DESKTOP', setupUrl)
  assert.equal(url, setupUrl)
  const mail = bhWindowsPurchaseInstallerMail(url!)
  assert.match(mail.html, new RegExp(BH_WINDOWS_INSTALLER_BUTTON_LABEL))
  assert.match(mail.html, /Bilirkisi-Hesap-Setup-3\.6\.2\.exe/)
  assert.match(mail.text, new RegExp(BH_WINDOWS_INSTALLER_BUTTON_LABEL))
  assert.match(mail.text, /Bilirkisi-Hesap-Setup-3\.6\.2\.exe/)
})

test('güncelleme adresi ve başka ürün satırı Windows kurulum linki olmaz', () => {
  assert.equal(resolveBilirkisiWindowsPurchaseInstallerUrl('license:BILIRKISI_DESKTOP', updaterUrl), null)
  assert.equal(resolveBilirkisiWindowsPurchaseInstallerUrl('license:BILIRKISI_DESKTOP', ''), null)
  assert.equal(resolveBilirkisiWindowsPurchaseInstallerUrl('license:OTHER', setupUrl), null)
  assert.equal(resolveBilirkisiWindowsPurchaseInstallerUrl('https://download.example.test/other.exe', setupUrl), null)
})
