import { escapeMailHtml } from './mailHtmlLayout'

import { pickBackendPublicOrigin, pickPublicSiteOrigin } from './mailDeliveryUrl'

import { signOrderDownloadToken, type OrderDownloadTokenPayload } from './orderDownloadToken'

import { paytrCallbackUrlLooksLocalOrPrivate } from './paytrCallbackUrl'



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



export function buildCustomerPasswordResetHref(plainToken: string): string {

  const site = pickPublicSiteOrigin()

  const base = site ?? 'https://woontegra.com'

  return `${base}/sifre-sifirla?token=${encodeURIComponent(plainToken)}`

}



const MK_SAAS_PRODUCTION_LOGIN_BASE = 'https://app.muvekkilkasasi.com'



function isProductionEnv(): boolean {

  return process.env.NODE_ENV === 'production'

}



function mkLoginUrlLooksLocalOrPrivate(url: string): boolean {

  const t = url.trim().toLowerCase()

  return paytrCallbackUrlLooksLocalOrPrivate(url) || t.includes('0.0.0.0')

}



function toMkLoginHref(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const u = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    const base = `${u.origin}${u.pathname.replace(/\/login\/?$/, '')}`.replace(/\/$/, '')
    return `${base}/login`
  } catch {
    const base = trimmed.replace(/\/$/, '').replace(/\/login\/?$/, '')
    if (!base) return null
    return `${base}/login`
  }
}



function acceptMkLoginCandidate(raw: string): string | null {

  const href = toMkLoginHref(raw)

  if (!href) return null

  if (isProductionEnv() && mkLoginUrlLooksLocalOrPrivate(href)) return null

  return href

}



/** Müvekkil Kasa SaaS web uygulaması giriş adresi (MUVEKKIL_KASA_SAAS_APP_URL). */

export function buildMuvekkilKasaSaasLoginHref(): string | null {

  return resolveMuvekkilKasaSaasLoginHref()

}



/** MK SaaS giriş URL’si; provision yanıtı veya env; production’da localhost reddedilir. */

export function resolveMuvekkilKasaSaasLoginHref(provisionLoginUrl?: string | null): string | null {

  const fromProvision = provisionLoginUrl?.trim()

  if (fromProvision) {

    const accepted = acceptMkLoginCandidate(fromProvision)

    if (accepted) return accepted

    if (isProductionEnv()) {

      console.error('[mail] MK provision loginUrl localhost/private in production; env/fallback kullanılacak', {

        loginUrl: fromProvision,

      })

    }

  }



  const envRaw = process.env.MUVEKKIL_KASA_SAAS_APP_URL?.trim()

  if (envRaw) {

    const accepted = acceptMkLoginCandidate(envRaw)

    if (accepted) return accepted

    if (isProductionEnv()) {

      console.error('[mail] MUVEKKIL_KASA_SAAS_APP_URL localhost/private in production; fallback kullanılacak', {

        url: envRaw,

      })

    }

  }



  if (isProductionEnv()) {

    return `${MK_SAAS_PRODUCTION_LOGIN_BASE.replace(/\/$/, '')}/login`

  }



  return null

}



export function buildOrderDownloadMailHref(payload: OrderDownloadTokenPayload): string {

  return buildBrandedOrderDownloadHref(signOrderDownloadToken(payload))

}



/** HTML e-posta: ham URL göstermeden indirme butonu */

export function mailDownloadButton(href: string, label = 'Programı İndir'): string {

  return mailActionButton(href, label, '#2563eb')

}



export function mailActionButton(href: string, label: string, bg = '#2563eb'): string {

  const safeHref = escapeMailHtml(href)

  const safeLabel = escapeMailHtml(label)

  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:20px 0;">

  <tr>

    <td align="center" style="border-radius:8px;background:${bg};">

      <a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${safeLabel}</a>

    </td>

  </tr>

</table>`

}


