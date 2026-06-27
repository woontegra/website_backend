import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEFAULT_SETTINGS = {
  siteName: 'Woontegra',
  siteDescription: 'Yazılım, e-ticaret ve dijital sistemler',
  logo: '/logo.svg',
  navbarLogoHeight: '42',
  navbarLogoWidth: '150',
  footerLogoHeight: '28',
  mobileLogoHeight: '34',
  favicon: '/favicon.svg',
  darkModeLogo: '',
  language: 'tr',
  currency: 'TRY',
  primaryColor: '#16a34a',
  secondaryColor: '#0ea5e9',
  fontFamily: 'Inter',
  borderRadius: 'lg',
  buttonStyle: 'solid',
  contactEmail: 'info@woontegra.com',
  contactPhone: '0532 317 17 55',
  contactWhatsApp: '905323171755',
  contactAddress: 'İskele Mahallesi Bademli Caddesi 43/6 Datça-Muğla',
  googleMapsEmbed: '',
  defaultTitle: 'Woontegra | Yazılım, Dijital Ticaret ve Teknoloji Çözümleri',
  defaultDescription:
    'Yazılım geliştirme, SaaS, e-ticaret, web tasarım, marka ve patent vekilliği, oyun geliştirme.',
  defaultKeywords: '[]',
  canonicalUrl: 'https://woontegra.com',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  twitterTitle: '',
  twitterDescription: '',
  twitterImage: '',
  indexable: 'true',
  followable: 'true',
  organizationName: 'Woontegra',
  organizationLogo: '',
  schemaJson: '',
  robotsTxt: '',
  googleAnalyticsId: '',
  googleTagManagerId: '',
  googleAdsConversionId: '',
  googleAdsConversionLabel: '',
  metaPixelId: '',
  metaConversionsAccessToken: '',
  metaTestEventCode: '',
  metaBrowserPixelEnabled: 'true',
  metaConversionsApiEnabled: 'false',
  tiktokPixelId: '',
  tiktokPixelEnabled: 'true',
  facebookPixelId: '',
  hotjarId: '',
  customHeadScript: '',
  customFooterScript: '',
  smtpHost: '',
  smtpPort: '587',
  smtpSecure: 'true',
  smtpUser: '',
  smtpPassword: '',
  maintenanceMode: 'false',
  maintenanceMessage: 'Site bakımda. Kısa süre sonra geri döneceğiz.',
}

const BOOLEAN_KEYS = new Set([
  'indexable',
  'followable',
  'smtpSecure',
  'maintenanceMode',
  'metaBrowserPixelEnabled',
  'metaConversionsApiEnabled',
  'tiktokPixelEnabled',
])

function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 6) return '••••••'
  return `••••••${value.slice(-6)}`
}

function normalizeSettings(settingsMap: Record<string, any>) {
  if (settingsMap.defaultKeywords && typeof settingsMap.defaultKeywords === 'string') {
    try {
      settingsMap.defaultKeywords = JSON.parse(settingsMap.defaultKeywords)
    } catch {
      settingsMap.defaultKeywords = []
    }
  }

  for (const key of BOOLEAN_KEYS) {
    settingsMap[key] = settingsMap[key] === 'true' || settingsMap[key] === true
  }

  if (!settingsMap.metaPixelId && settingsMap.facebookPixelId) {
    settingsMap.metaPixelId = settingsMap.facebookPixelId
  }

  return settingsMap
}

function sanitizeForAdmin(settings: Record<string, any>) {
  const token = String(settings.metaConversionsAccessToken || '')
  const smtpPassword = String(settings.smtpPassword || '')
  const gaSecret = String(settings.gaMeasurementApiSecret || '')

  return {
    ...settings,
    metaConversionsAccessToken: '',
    smtpPassword: '',
    gaMeasurementApiSecret: '',
    metaConversionsAccessTokenConfigured: Boolean(token),
    metaConversionsAccessTokenPreview: token ? maskSecret(token) : '',
    smtpPasswordConfigured: Boolean(smtpPassword),
    smtpPasswordPreview: smtpPassword ? maskSecret(smtpPassword) : '',
    gaMeasurementApiSecretConfigured: Boolean(gaSecret),
    gaMeasurementApiSecretPreview: gaSecret ? maskSecret(gaSecret) : '',
  }
}

const LOGO_HEIGHT_MIN = 24
const LOGO_HEIGHT_MAX = 90
const LOGO_WIDTH_MIN = 80
const LOGO_WIDTH_MAX = 260

function parseLogoHeight(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(LOGO_HEIGHT_MAX, Math.max(LOGO_HEIGHT_MIN, parsed))
}

function parseLogoWidth(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(LOGO_WIDTH_MAX, Math.max(LOGO_WIDTH_MIN, parsed))
}

async function getSettingUpdatedAt(key: string): Promise<string> {
  const row = await prisma.siteSetting.findUnique({
    where: { key },
    select: { updatedAt: true },
  })
  return row?.updatedAt?.toISOString() ?? ''
}

export const settingsService = {
  async getPublic() {
    const settings = await this.getAll()
    const logoUpdatedAt = await getSettingUpdatedAt('logo')
    const faviconUpdatedAt = await getSettingUpdatedAt('favicon')
    return {
      siteName: settings.siteName,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      contactAddress: settings.contactAddress,
      logo: settings.logo,
      logoUpdatedAt,
      navbarLogoHeight: parseLogoHeight(settings.navbarLogoHeight, 42),
      navbarLogoWidth: parseLogoWidth(settings.navbarLogoWidth, 150),
      footerLogoHeight: parseLogoHeight(settings.footerLogoHeight, 28),
      mobileLogoHeight: parseLogoHeight(settings.mobileLogoHeight, 34),
      favicon: settings.favicon,
      faviconUpdatedAt,
      primaryColor: settings.primaryColor,
      secondaryColor: settings.secondaryColor,
    }
  },

  async touchLogo(path: string) {
    const logoPath = path.trim() || DEFAULT_SETTINGS.logo
    await prisma.siteSetting.upsert({
      where: { key: 'logo' },
      update: { value: logoPath },
      create: { key: 'logo', value: logoPath },
    })
  },

  async getPublicTracking() {
    const settings = await this.getAll()
    return {
      googleAnalyticsId: settings.googleAnalyticsId,
      googleTagManagerId: settings.googleTagManagerId,
      googleAdsConversionId: settings.googleAdsConversionId,
      googleAdsConversionLabel: settings.googleAdsConversionLabel,
      metaPixelId: settings.metaPixelId || settings.facebookPixelId,
      metaBrowserPixelEnabled: settings.metaBrowserPixelEnabled,
      tiktokPixelId: settings.tiktokPixelId,
      tiktokPixelEnabled: settings.tiktokPixelEnabled,
      googleSiteVerification: settings.googleSiteVerification || '',
      analyticsPublicJson: settings.analyticsPublicJson || '',
    }
  },

  async getAll() {
    const dbSettings = await prisma.siteSetting.findMany()
    const settingsMap: Record<string, any> = { ...DEFAULT_SETTINGS }

    dbSettings.forEach((setting) => {
      settingsMap[setting.key] = setting.value
    })

    return normalizeSettings(settingsMap)
  },

  async getAdmin() {
    const settings = await this.getAll()
    const logoUpdatedAt = await getSettingUpdatedAt('logo')
    const faviconUpdatedAt = await getSettingUpdatedAt('favicon')
    return { ...sanitizeForAdmin(settings), logoUpdatedAt, faviconUpdatedAt }
  },

  async update(data: Record<string, any>) {
    const payload = { ...data }

    delete payload.metaConversionsAccessTokenConfigured
    delete payload.metaConversionsAccessTokenPreview
    delete payload.smtpPasswordConfigured
    delete payload.smtpPasswordPreview
    delete payload.gaMeasurementApiSecretConfigured
    delete payload.gaMeasurementApiSecretPreview

    if (payload.clearMetaConversionsAccessToken === true) {
      payload.metaConversionsAccessToken = ''
      delete payload.clearMetaConversionsAccessToken
    } else if ('metaConversionsAccessToken' in payload) {
      const nextToken = String(payload.metaConversionsAccessToken || '').trim()
      if (!nextToken) {
        delete payload.metaConversionsAccessToken
      } else {
        payload.metaConversionsAccessToken = nextToken
      }
    }

    if ('smtpPassword' in payload) {
      const nextPassword = String(payload.smtpPassword || '').trim()
      if (!nextPassword) {
        delete payload.smtpPassword
      } else {
        payload.smtpPassword = nextPassword
      }
    }

    if ('gaMeasurementApiSecret' in payload) {
      const nextSecret = String(payload.gaMeasurementApiSecret || '').trim()
      if (!nextSecret) {
        delete payload.gaMeasurementApiSecret
      } else {
        payload.gaMeasurementApiSecret = nextSecret
      }
    }

    if (payload.metaPixelId) {
      payload.facebookPixelId = payload.metaPixelId
    }

    const updates = []

    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) continue

      if (key === 'metaConversionsAccessToken' && !String(value).trim()) continue
      if (key === 'smtpPassword' && !String(value).trim()) continue
      if (key === 'gaMeasurementApiSecret' && !String(value).trim()) continue

      let stringValue: string

      if (Array.isArray(value)) {
        stringValue = JSON.stringify(value)
      } else if (typeof value === 'boolean') {
        stringValue = value.toString()
      } else if (value !== null) {
        stringValue = String(value)
      } else {
        stringValue = ''
      }

      updates.push(
        prisma.siteSetting.upsert({
          where: { key },
          update: { value: stringValue },
          create: { key, value: stringValue },
        }),
      )
    }

    if (updates.length > 0) {
      await Promise.all(updates)
    }

    return this.getAdmin()
  },

  async clearCache() {
    return { success: true, message: 'Cache cleared' }
  },
}
