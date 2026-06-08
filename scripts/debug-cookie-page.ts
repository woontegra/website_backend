import { runCookieScan } from '../src/services/cookieScanner.service'

async function main() {
  const report = await runCookieScan('https://woontegra.com')
  for (const page of report.pages) {
    console.log(page.path, page.status, page.error || page.statusCode)
  }
  console.log('cookies', report.cookies.length)
  console.log('localStorage items', report.cookies.filter((c) => c.source === 'localStorage').map((c) => c.name))
}

main().catch(console.error)
