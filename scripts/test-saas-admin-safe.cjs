/**
 * Safe manual QA for SaaS admin module.
 * - Read-only checks on real data
 * - Mutations only on test-saas@woontegra.com and its test membership
 */
const { chromium, request } = require('playwright')

const APP = 'http://127.0.0.1:5173'
const API = 'http://localhost:4000'
const ADMIN_EMAIL = 'info@woontegra.com'
const ADMIN_PASSWORD = 'Admin123!'
const TEST_EMAIL = 'test-saas@woontegra.com'
const TEST_PASSWORD = 'Test12345!'
const MK_SLUG = 'muvekkil-kasa-defteri-web-tabanli'

async function main() {
  const report = {
    testCustomer: TEST_EMAIL,
    testMembershipId: null,
    testMembershipCreated: false,
    touchedRealCustomerData: false,
    readOnly: {},
    mutations: {},
    consoleErrors: [],
    apiErrors: [],
    pageErrors: [],
  }

  const publicReq = await request.newContext({ baseURL: API })
  const adminLogin = await publicReq.post('/api/auth/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
  if (!adminLogin.ok()) throw new Error(`Admin login failed: ${adminLogin.status()}`)
  const adminToken = (await adminLogin.json()).token
  const adminReq = await request.newContext({
    baseURL: API,
    extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
  })

  // Ensure test customer exists (register or login probe)
  let testCustomerOk = false
  const reg = await publicReq.post('/api/customers/register', {
    data: { name: 'SaaS Test Kullanıcı', email: TEST_EMAIL, password: TEST_PASSWORD },
  })
  if (reg.ok()) {
    testCustomerOk = true
    report.testCustomerCreated = true
  } else {
    const login = await publicReq.post('/api/customers/login', { data: { email: TEST_EMAIL, password: TEST_PASSWORD } })
    testCustomerOk = login.ok()
    report.testCustomerCreated = false
  }
  report.testCustomerReady = testCustomerOk

  const membershipsRes = await adminReq.get('/api/admin/saas-memberships')
  const allMemberships = (await membershipsRes.json()).data || []
  report.readOnly.existingMembershipCount = allMemberships.length
  report.readOnly.mkVisible = allMemberships.some(
    (m) => m.productCode === 'MUVEKKIL_KASA_SAAS' || (m.productName || '').toLowerCase().includes('web tabanlı'),
  )
  report.readOnly.desktopInSaasList = allMemberships.some((m) => (m.productName || '').toLowerCase().includes('desktop'))

  const productsRes = await adminReq.get('/api/admin/products')
  const products = (await productsRes.json()).data || []
  const mkProduct = products.find((p) => p.slug === MK_SLUG)
  report.readOnly.mkProductFound = Boolean(mkProduct)
  report.readOnly.mkProductEligibleForManualCreate = Boolean(
    mkProduct &&
      mkProduct.isActive === true &&
      mkProduct.productType === 'SAAS' &&
      (mkProduct.slug === MK_SLUG || (mkProduct.name || '').toLowerCase().includes('web tabanlı')),
  )
  report.readOnly.mkProductFields = mkProduct
    ? {
        id: mkProduct.id,
        name: mkProduct.name,
        slug: mkProduct.slug,
        productType: mkProduct.productType,
        licenseRequired: mkProduct.licenseRequired,
        isActive: mkProduct.isActive,
      }
    : null

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const capture = (prefix = '') => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push(`${prefix}${msg.text()}`)
    })
    page.on('pageerror', (err) => report.pageErrors.push(`${prefix}${String(err)}`))
    page.on('response', (res) => {
      if (res.status() >= 400 && res.url().includes('/api/')) {
        report.apiErrors.push(`${prefix}${res.status()} ${res.url()}`)
      }
    })
  }
  capture()

  // --- Phase A: read-only UI ---
  await page.goto(`${APP}/admin/giris`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', ADMIN_EMAIL)
  await page.fill('input[type="password"]', ADMIN_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/admin', { timeout: 20000 })

  const navTexts = await page.locator('aside nav a').allInnerTexts()
  const wanted = ['SaaS Abonelikleri', 'Manuel Abonelik Oluştur', 'Masaüstü Lisans Özetleri']
  report.readOnly.sidebarOrder = navTexts.map((t) => t.trim()).filter((t) => wanted.includes(t))
  report.readOnly.sidebarOk =
    JSON.stringify(report.readOnly.sidebarOrder) === JSON.stringify(wanted)

  await page.goto(`${APP}/admin/saas-subscriptions`, { waitUntil: 'networkidle' })
  report.readOnly.saasListOpens = page.url().includes('/admin/saas-subscriptions')

  if (allMemberships.length > 0) {
    const activeApi = ((await (await adminReq.get('/api/admin/saas-memberships?status=ACTIVE')).json()).data || []).length
    await page.locator('select').first().selectOption('ACTIVE')
    await page.waitForTimeout(600)
    const activeUi = await page.locator('tbody tr').count()
    report.readOnly.filterActive = { api: activeApi, ui: activeUi }

    const sample = allMemberships.find((m) => m.customerEmail !== TEST_EMAIL) || allMemberships[0]
    const searchValue = sample.tenantSlug || sample.customerEmail || sample.licenseKey
    await page.fill('input[placeholder*="Müşteri, e-posta"]', searchValue)
    await page.waitForTimeout(700)
    const searchApi = ((await (await adminReq.get(`/api/admin/saas-memberships?q=${encodeURIComponent(searchValue)}`)).json()).data || []).length
    const searchUi = await page.locator('tbody tr').count()
    report.readOnly.searchWorks = searchApi >= 1 && searchUi === searchApi

    // Open existing detail read-only (not test customer if possible)
    const readTarget = allMemberships.find((m) => m.customerEmail !== TEST_EMAIL) || sample
    await page.fill('input[placeholder*="Müşteri, e-posta"]', '')
    await page.locator('select').first().selectOption('')
    await page.goto(`${APP}/admin/saas-subscriptions/${readTarget.id}`, { waitUntil: 'networkidle' })
    const body = await page.locator('body').textContent()
    report.readOnly.detailOpens = page.url().includes(readTarget.id)
    report.readOnly.detailFieldsOk = [readTarget.customerEmail, readTarget.productName, readTarget.tenantId].every((v) =>
      (body || '').includes(String(v)),
    )
  } else {
    report.readOnly.detailOpens = false
    report.readOnly.detailFieldsOk = false
  }

  await page.goto(`${APP}/admin`, { waitUntil: 'networkidle' })
  const activeCard = page.locator('a', { hasText: 'Aktif SaaS Abonelikleri' }).first()
  report.readOnly.dashboardHasActiveCard = (await activeCard.count()) > 0
  await activeCard.click()
  await page.waitForURL('**/admin/saas-subscriptions', { timeout: 10000 })
  report.readOnly.dashboardLinkWorks = page.url().includes('/admin/saas-subscriptions')

  // --- Phase B: test customer only mutations ---
  if (!testCustomerOk) throw new Error('Test customer could not be prepared')
  if (!mkProduct) throw new Error('MK Web Tabanlı product not found')

  const existingTestMemberships = allMemberships.filter((m) => m.customerEmail === TEST_EMAIL)
  let testMembership = existingTestMemberships[0]

  if (!testMembership) {
    if (!report.readOnly.mkProductEligibleForManualCreate) {
      report.mutations = {
        skipped: true,
        reason: 'MK Web ürünü manuel SaaS uygunluk kontrolünden geçemedi.',
        createAttempted: false,
      }
    } else {
      const now = new Date()
      const end = new Date(now)
      end.setDate(end.getDate() + 30)
      const createRes = await adminReq.post('/api/admin/saas-memberships', {
        data: {
          customerEmail: TEST_EMAIL,
          productId: mkProduct.id,
          licenseStartDate: now.toISOString(),
          licenseEndDate: end.toISOString(),
          status: 'ACTIVE',
          tenantId: `tenant-test-${Date.now()}`,
          tenantSlug: `tenant-slug-test-${Date.now()}`,
          licenseKey: `LIC-TEST-${Date.now()}`,
        },
      })
      if (!createRes.ok()) {
        const errText = await createRes.text()
        report.mutations = {
          skipped: true,
          createAttempted: true,
          createFailed: true,
          createStatus: createRes.status(),
          createError: errText,
        }
      } else {
        testMembership = (await createRes.json()).data
        report.testMembershipCreated = true
      }
    }
  } else {
    report.testMembershipCreated = false
    report.mutations = { note: 'Reused existing test-saas membership; no new create' }
  }

  if (testMembership) {
    report.testMembershipId = testMembership.id
    report.touchedRealCustomerData = false

    const oldEnd = testMembership.licenseEndDate
    const extendRes = await adminReq.patch(`/api/admin/saas-memberships/${testMembership.id}/extend`, { data: { days: 1 } })
    const afterExtend = (await extendRes.json()).data
    report.mutations.extendWorked =
      extendRes.ok() && new Date(afterExtend.licenseEndDate).getTime() > new Date(oldEnd).getTime()

    async function setStatus(status) {
      const res = await adminReq.patch(`/api/admin/saas-memberships/${testMembership.id}/status`, { data: { status } })
      const row = (await res.json()).data
      return res.ok() && row.status === status
    }

    report.mutations.suspend = await setStatus('SUSPENDED')
    report.mutations.activateAfterSuspend = await setStatus('ACTIVE')
    report.mutations.expired = await setStatus('EXPIRED')
    report.mutations.activateAfterExpired = await setStatus('ACTIVE')

    await page.goto(`${APP}/admin/saas-subscriptions`, { waitUntil: 'networkidle' })
    await page.fill('input[placeholder*="Müşteri, e-posta"]', TEST_EMAIL)
    await page.waitForTimeout(700)
    const listBody = await page.locator('tbody').textContent()
    report.mutations.visibleInAdminList = (listBody || '').includes(TEST_EMAIL)

    const customerPage = await browser.newPage()
    capture('[customer] ')
    await customerPage.goto(`${APP}/giris?return=/hesabim/uyelikler`, { waitUntil: 'networkidle' })
    await customerPage.fill('input[type="email"]', TEST_EMAIL)
    await customerPage.fill('input[type="password"]', TEST_PASSWORD)
    await customerPage.click('button[type="submit"]')
    await customerPage.waitForURL('**/hesabim/uyelikler', { timeout: 20000 })
    const customerBody = await customerPage.locator('body').textContent()
    report.mutations.visibleInCustomerAccount = (customerBody || '').includes(mkProduct.name)
    await customerPage.close()
  } else {
    report.testMembershipId = null
    report.mutations = report.mutations || { skipped: true, reason: 'No test membership available' }

    // UI create page check (read-only): does MK product appear?
    await page.goto(`${APP}/admin/saas-subscriptions/new`, { waitUntil: 'networkidle' })
    const createBody = await page.locator('body').textContent()
    report.mutations.createPageOpens = page.url().includes('/admin/saas-subscriptions/new')
    report.mutations.mkProductInCreateDropdown = (createBody || '').includes(mkProduct.name)
  }
  await browser.close()
  await publicReq.dispose()
  await adminReq.dispose()

  console.log(JSON.stringify(report, null, 2))
}

main().catch((err) => {
  console.error('SAFE_TEST_FAILED')
  console.error(err)
  process.exit(1)
})
