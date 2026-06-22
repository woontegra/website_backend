/** Sipariş ve yasal metinlerde kullanılan satıcı (şirket) bilgileri — env ile özelleştirilebilir */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildSellerVars(): Record<string, string> {
  return {
    sellerTitle:
      process.env.SELLER_LEGAL_TITLE?.trim() || 'Woontegra Teknoloji Yazılım ve Dijital Hizmetler Ltd. Şti.',
    sellerEmail: process.env.SELLER_LEGAL_EMAIL?.trim() || 'info@woontegra.com',
    sellerPhone: process.env.SELLER_LEGAL_PHONE?.trim() || '+90 532 317 17 55',
    sellerAddress:
      process.env.SELLER_LEGAL_ADDRESS?.trim() ||
      'İskele Mahallesi Bademli Caddesi Hanlılar 2 Sitesi 43/6 Datça / Muğla 48900',
    sellerTaxOffice: process.env.SELLER_LEGAL_TAX_OFFICE?.trim() || 'Datça Vergi Dairesi',
    sellerTaxNumber: process.env.SELLER_LEGAL_TAX_NUMBER?.trim() || '8141122110',
    sellerMersis: process.env.SELLER_LEGAL_MERSIS?.trim() || '0814112211000001',
    sellerWebsite: process.env.SELLER_LEGAL_WEBSITE?.trim() || 'https://woontegra.com',
  }
}

/** Yasal metin şablonlarında para birimi gösterimi (TRY → ₺). */
export function formatLegalCurrencyDisplay(currency: string): string {
  const c = (currency || 'TRY').trim().toUpperCase()
  if (c === 'TRY' || c === 'TL') return '₺'
  return c
}
