import { escapeMailHtml, mailHtmlDocument, mailInfoTable } from './mailHtmlLayout'

export const CUSTOMER_REGISTRATION_ADMIN_TO = 'info@woontegra.com'
export const CUSTOMER_REGISTRATION_ADMIN_SUBJECT = 'Yeni Müşteri Kaydı'

export function formatCustomerRegisteredAtTurkey(date: Date): string {
  const parts = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('day')}.${pick('month')}.${pick('year')} ${pick('hour')}:${pick('minute')}`
}

export function buildCustomerRegistrationAdminMail(input: {
  customerName: string
  customerEmail: string
  registeredAt: Date
}) {
  const registeredLabel = `${formatCustomerRegisteredAtTurkey(input.registeredAt)} (Türkiye saati)`
  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155;">Yeni bir müşteri hesabı oluşturuldu.</p>
    ${mailInfoTable([
      { label: 'Ad soyad', value: escapeMailHtml(input.customerName.trim()) },
      { label: 'E-posta', value: escapeMailHtml(input.customerEmail.trim()) },
      { label: 'Kayıt tarihi', value: escapeMailHtml(registeredLabel) },
    ])}`
  const text = [
    'Yeni bir müşteri hesabı oluşturuldu.',
    '',
    `Ad soyad: ${input.customerName.trim()}`,
    `E-posta: ${input.customerEmail.trim()}`,
    `Kayıt tarihi: ${registeredLabel}`,
  ].join('\n')

  return {
    to: CUSTOMER_REGISTRATION_ADMIN_TO,
    subject: CUSTOMER_REGISTRATION_ADMIN_SUBJECT,
    text,
    html: mailHtmlDocument(CUSTOMER_REGISTRATION_ADMIN_SUBJECT, bodyHtml),
  }
}
