/** Sipariş ve yasal metinlerde kullanılan satıcı (şirket) bilgileri — env ile özelleştirilebilir */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildSellerVars(): Record<string, string> {
  const dash = '—'
  return {
    sellerTitle:
      process.env.SELLER_LEGAL_TITLE?.trim() || 'Woontegra Teknoloji Yazılım ve Dijital Hizmetler Ltd. Şti.',
    sellerEmail: process.env.SELLER_LEGAL_EMAIL?.trim() || 'info@woontegra.com',
    sellerPhone: process.env.SELLER_LEGAL_PHONE?.trim() || dash,
    sellerAddress: process.env.SELLER_LEGAL_ADDRESS?.trim() || dash,
  }
}
