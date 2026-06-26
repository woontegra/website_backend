/**
 * Secret presence/match check — değerleri loglamaz.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function readEnvKey(filePath: string, key: string): string | null {
  if (!fs.existsSync(filePath)) return null
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const k = line.slice(0, idx).trim()
    if (k !== key) continue
    const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    return v || null
  }
  return null
}

const licenseServerEnv = path.resolve(__dirname, '../../../Woontegra-Lisans-Server/backend/.env')
const websiteBackendEnv = path.resolve(__dirname, '../.env')

const lsSecret = readEnvKey(licenseServerEnv, 'INTEGRATION_SECRET')
const wbSecret = readEnvKey(websiteBackendEnv, 'LICENSE_SERVER_INTEGRATION_SECRET')

const report = {
  licenseServerEnvFile: fs.existsSync(licenseServerEnv) ? 'var' : 'yok',
  websiteBackendEnvFile: fs.existsSync(websiteBackendEnv) ? 'var' : 'yok',
  licenseServerIntegrationSecret: lsSecret ? 'var' : 'yok',
  websiteBackendIntegrationSecret: wbSecret ? 'var' : 'yok',
  localMatch:
    lsSecret && wbSecret
      ? lsSecret === wbSecret
        ? 'eşleşiyor'
        : 'eşleşmiyor'
      : 'karşılaştırılamadı',
  websiteBackendSecretIsPlaceholder: wbSecret === 'change-me-integration-secret' ? 'evet' : 'hayır',
}

console.log(JSON.stringify(report, null, 2))
