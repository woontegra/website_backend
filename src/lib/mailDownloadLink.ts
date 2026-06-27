import { escapeMailHtml } from './mailHtmlLayout'
import { pickBackendPublicOrigin, pickPublicSiteOrigin } from './mailDeliveryUrl'
import { signOrderDownloadToken, type OrderDownloadTokenPayload } from './orderDownloadToken'

export function buildBrandedOrderDownloadHref(token: string): string {
  const encoded = encodeURIComponent(token)
  const site = pickPublicSiteOrigin()
  if (site) return `${site}/api/downloads/order/${encoded}`
  const backend = pickBackendPublicOrigin()
  if (backend) return `${backend}/api/downloads/order/${encoded}`
  const port = process.env.PORT ?? 4000
  return `http://127.0.0.1:${port}/api/downloads/order/${encoded}`
}

export function buildCustomerOrdersPageHref(): string {
  const site = pickPublicSiteOrigin()
  return site ? `${site}/hesabim/siparisler` : 'https://woontegra.com/hesabim/siparisler'
}

export function buildCustomerLoginPageHref(): string {
  const site = pickPublicSiteOrigin()
  return site ? `${site}/giris` : 'https://woontegra.com/giris'
}

export function buildOrderDownloadMailHref(payload: OrderDownloadTokenPayload): string {
  return buildBrandedOrderDownloadHref(signOrderDownloadToken(payload))
}

/** HTML e-posta: ham URL göstermeden indirme butonu */
export function mailDownloadButton(href: string, label = 'Programı İndir'): string {
  const safeHref = escapeMailHtml(href)
  const safeLabel = escapeMailHtml(label)
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:20px 0;">
  <tr>
    <td align="center" style="border-radius:8px;background:#2563eb;">
      <a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${safeLabel}</a>
    </td>
  </tr>
</table>`
}
