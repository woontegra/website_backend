import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEFAULT_SETTINGS = {
  siteName: 'Woontegra',
  siteDescription: 'Yazılım, e-ticaret ve dijital sistemler',
  logo: '',
  favicon: '',
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
  defaultDescription: 'Yazılım geliştirme, SaaS, e-ticaret, web tasarım, marka ve patent vekilliği, oyun geliştirme.',
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
  facebookPixelId: '',
  tiktokPixelId: '',
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

export const settingsService = {
  async getPublic() {
    const settings = await this.getAll()
    return {
      siteName: settings.siteName,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      contactAddress: settings.contactAddress,
      logo: settings.logo,
      primaryColor: settings.primaryColor,
      secondaryColor: settings.secondaryColor,
    }
  },

  async getAll() {
    const dbSettings = await prisma.siteSetting.findMany()
    const settingsMap: Record<string, any> = { ...DEFAULT_SETTINGS }

    dbSettings.forEach((setting) => {
      settingsMap[setting.key] = setting.value
    })

    // Parse JSON fields
    if (settingsMap.defaultKeywords && typeof settingsMap.defaultKeywords === 'string') {
      try {
        settingsMap.defaultKeywords = JSON.parse(settingsMap.defaultKeywords)
      } catch {
        settingsMap.defaultKeywords = []
      }
    }

    // Parse boolean fields
    settingsMap.indexable = settingsMap.indexable === 'true'
    settingsMap.followable = settingsMap.followable === 'true'
    settingsMap.smtpSecure = settingsMap.smtpSecure === 'true'
    settingsMap.maintenanceMode = settingsMap.maintenanceMode === 'true'

    return settingsMap
  },

  async update(data: Record<string, any>) {
    const updates = []

    for (const [key, value] of Object.entries(data)) {
      let stringValue = value

      // Convert arrays to JSON strings
      if (Array.isArray(value)) {
        stringValue = JSON.stringify(value)
      }
      // Convert booleans to strings
      else if (typeof value === 'boolean') {
        stringValue = value.toString()
      }
      // Convert to string
      else if (value !== null && value !== undefined) {
        stringValue = String(value)
      } else {
        stringValue = ''
      }

      updates.push(
        prisma.siteSetting.upsert({
          where: { key },
          update: { value: stringValue },
          create: { key, value: stringValue },
        })
      )
    }

    await Promise.all(updates)
    return this.getAll()
  },

  async clearCache() {
    // Implement cache clearing logic if needed
    return { success: true, message: 'Cache cleared' }
  },
}
