import { ProductType } from '@prisma/client'
import { formatLegalCurrencyDisplay } from './legalSeller'

/** PDF görünümü için okunabilir tarih: 22.06.2026 17:27:53 */
export function formatPdfDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** PDF görünümü için Türkçe para: 2.500,00 ₺ */
export function formatPdfMoneyAmount(amount: number, currency?: string | null): string {
  if (!Number.isFinite(amount)) return `0,00 ${formatLegalCurrencyDisplay(currency ?? 'TRY')}`
  const formatted = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return `${formatted} ${formatLegalCurrencyDisplay(currency ?? 'TRY')}`
}

export function formatPdfProductQuantityLabel(quantity: number, productType?: ProductType | string | null): string {
  const q = Math.max(1, Math.floor(quantity) || 1)
  const type = (productType ?? '').toString().toUpperCase()
  if (type === ProductType.SAAS || type === ProductType.SERVICE || type === 'SAAS' || type === 'SERVICE') {
    return q === 1 ? '1 yıl' : `${q} yıl`
  }
  return q === 1 ? '1 adet' : `${q} adet`
}

export function formatPdfProductPlanLabel(productType?: ProductType | string | null): string {
  const type = (productType ?? '').toString().toUpperCase()
  if (type === ProductType.SAAS || type === ProductType.SERVICE || type === 'SAAS' || type === 'SERVICE') {
    return 'Yıllık Abonelik'
  }
  if (type === ProductType.DOWNLOAD || type === 'DOWNLOAD') {
    return 'Ömür Boyu Lisans'
  }
  return ''
}
