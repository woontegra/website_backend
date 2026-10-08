import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  CUSTOMER_REGISTRATION_ADMIN_SUBJECT,
  CUSTOMER_REGISTRATION_ADMIN_TO,
  buildCustomerRegistrationAdminMail,
  formatCustomerRegisteredAtTurkey,
} from './customerRegistrationAdminMail'

test('admin registration notice uses Turkey time and omits the password', () => {
  const registeredAt = new Date('2026-10-08T07:15:52.043Z')
  assert.equal(formatCustomerRegisteredAtTurkey(registeredAt), '08.10.2026 10:15')

  const mail = buildCustomerRegistrationAdminMail({
    customerName: 'Ayşe <Yılmaz>',
    customerEmail: 'ayse@example.com',
    registeredAt,
  })

  assert.equal(mail.to, CUSTOMER_REGISTRATION_ADMIN_TO)
  assert.equal(mail.to, 'info@woontegra.com')
  assert.equal(mail.subject, CUSTOMER_REGISTRATION_ADMIN_SUBJECT)
  assert.equal(mail.subject, 'Yeni Müşteri Kaydı')
  assert.match(mail.text, /Ad soyad: Ayşe <Yılmaz>/)
  assert.match(mail.text, /E-posta: ayse@example.com/)
  assert.match(mail.text, /Kayıt tarihi: 08\.10\.2026 10:15 \(Türkiye saati\)/)
  assert.match(mail.html, /Ayşe &lt;Yılmaz&gt;/)
  assert.match(mail.html, /ayse@example.com/)
  assert.match(mail.html, /08\.10\.2026 10:15 \(Türkiye saati\)/)
  assert.doesNotMatch(mail.text, /şifre|password/i)
  assert.doesNotMatch(mail.html, /şifre|password/i)
})

test('registration admin notice is sent only after a new customer is created', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/services/customers.service.ts'), 'utf8')
  const registerStart = source.indexOf('async register(')
  const loginStart = source.indexOf('async login(')
  assert.ok(registerStart >= 0 && loginStart > registerStart)
  const registerBody = source.slice(registerStart, loginStart)
  const loginBody = source.slice(loginStart, source.indexOf('async getMe('))

  assert.equal(registerBody.includes('sendCustomerWelcomeEmail'), true)
  assert.equal(registerBody.includes('sendCustomerRegistrationAdminNotification'), true)
  const createAt = registerBody.indexOf('prisma.customer.create')
  const noticeAt = registerBody.indexOf('sendCustomerRegistrationAdminNotification')
  assert.ok(createAt > 0 && createAt < noticeAt)
  assert.equal(loginBody.includes('sendCustomerRegistrationAdminNotification'), false)

  const noticeCall = registerBody.slice(registerBody.indexOf('sendCustomerRegistrationAdminNotification'))
  const noticeArgs = noticeCall.slice(0, noticeCall.indexOf('.catch'))
  assert.equal(noticeArgs.includes('plainPassword'), false)
  assert.equal(noticeArgs.includes('password'), false)
  assert.equal(noticeArgs.includes('registeredAt: c.createdAt'), true)
})
