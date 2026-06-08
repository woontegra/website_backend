export type CookieCategory = 'necessary' | 'analytics' | 'marketing' | 'functional' | 'unknown'

export type CookieCatalogEntry = {
  provider: string
  category: CookieCategory
  purpose: string
}

const UNKNOWN_PURPOSE =
  'Bu çerez otomatik taramada tespit edildi ancak amacı sınıflandırılamadı.'

const EXACT_MATCH: Record<string, CookieCatalogEntry> = {
  _ga: {
    provider: 'Google Analytics',
    category: 'analytics',
    purpose: 'Ziyaretçi davranışını anonim şekilde analiz etmek için kullanılır.',
  },
  _gid: {
    provider: 'Google Analytics',
    category: 'analytics',
    purpose: 'Günlük ziyaretçi ve oturum ayrımı için kullanılır.',
  },
  _gat: {
    provider: 'Google Analytics',
    category: 'analytics',
    purpose: 'İstek hızını sınırlamak için kullanılır.',
  },
  _fbp: {
    provider: 'Meta / Facebook',
    category: 'marketing',
    purpose: 'Reklam ve dönüşüm ölçümü için kullanılır.',
  },
  _fbc: {
    provider: 'Meta / Facebook',
    category: 'marketing',
    purpose: 'Facebook reklam tıklaması ve dönüşüm ilişkilendirmesi için kullanılır.',
  },
  fr: {
    provider: 'Meta / Facebook',
    category: 'marketing',
    purpose: 'Facebook reklam hedefleme ve ölçümü için kullanılır.',
  },
  _ttp: {
    provider: 'TikTok',
    category: 'marketing',
    purpose: 'TikTok reklam ve dönüşüm ölçümü için kullanılır.',
  },
  _tt_enable_cookie: {
    provider: 'TikTok',
    category: 'marketing',
    purpose: 'TikTok piksel çerez kullanımını etkinleştirir.',
  },
  woontegra_cookie_consent: {
    provider: 'Woontegra',
    category: 'necessary',
    purpose: 'Çerez tercihlerinizi saklamak için kullanılır.',
  },
}

const PREFIX_MATCH: Array<{ prefix: string; entry: CookieCatalogEntry }> = [
  {
    prefix: '_ga_',
    entry: {
      provider: 'Google Analytics',
      category: 'analytics',
      purpose: 'Oturum ve sayfa görüntüleme ölçümü için kullanılır.',
    },
  },
  {
    prefix: '_gcl_',
    entry: {
      provider: 'Google Ads',
      category: 'marketing',
      purpose: 'Google Ads dönüşüm ve tıklama ölçümü için kullanılır.',
    },
  },
]

const DOMAIN_HINTS: Array<{ pattern: RegExp; entry: CookieCatalogEntry }> = [
  {
    pattern: /google-analytics\.com|googletagmanager\.com/i,
    entry: {
      provider: 'Google Analytics',
      category: 'analytics',
      purpose: 'Google Analytics ölçüm hizmeti tarafından ayarlanır.',
    },
  },
  {
    pattern: /facebook\.com|connect\.facebook\.net/i,
    entry: {
      provider: 'Meta / Facebook',
      category: 'marketing',
      purpose: 'Meta reklam ve ölçüm hizmeti tarafından ayarlanır.',
    },
  },
  {
    pattern: /tiktok\.com|analytics\.tiktok\.com/i,
    entry: {
      provider: 'TikTok',
      category: 'marketing',
      purpose: 'TikTok reklam ve ölçüm hizmeti tarafından ayarlanır.',
    },
  },
]

export function classifyCookieName(
  name: string,
  domain = '',
  scriptHost = '',
): CookieCatalogEntry {
  const trimmed = name.trim()
  if (!trimmed) {
    return { provider: '', category: 'unknown', purpose: UNKNOWN_PURPOSE }
  }

  if (EXACT_MATCH[trimmed]) {
    return EXACT_MATCH[trimmed]
  }

  for (const { prefix, entry } of PREFIX_MATCH) {
    if (trimmed.startsWith(prefix)) {
      return entry
    }
  }

  const hostHint = `${domain} ${scriptHost}`
  for (const { pattern, entry } of DOMAIN_HINTS) {
    if (pattern.test(hostHint)) {
      return entry
    }
  }

  return { provider: '', category: 'unknown', purpose: UNKNOWN_PURPOSE }
}

export function getUnknownPurpose(): string {
  return UNKNOWN_PURPOSE
}
