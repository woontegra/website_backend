import 'dotenv/config'
import { cookieInventoryService } from '../src/services/cookieInventory.service'

async function main() {
  const result = await cookieInventoryService.runScan()
  console.log('Scan completed at', result.scannedAt)
  console.log('Pages:', result.report.pages.map((p) => `${p.path}: ${p.status}`).join(', '))
  console.log('Cookies found:', result.report.cookies.length)
  for (const cookie of result.report.cookies) {
    console.log(
      `- ${cookie.name} | ${cookie.provider || '—'} | ${cookie.category} | ${cookie.duration} | ${cookie.source}`,
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
