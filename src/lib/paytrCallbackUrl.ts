/** PayTR sunucusundan erişilemeyen / mağaza panelinde kullanılmaması gereken adresler */
export function paytrCallbackUrlLooksLocalOrPrivate(url: string): boolean {
  const t = url.trim().toLowerCase()
  if (!t) return true
  return (
    t.includes('localhost') ||
    t.includes('127.0.0.1') ||
    t.includes('[::1]') ||
    /^http:\/\/192\.168\./.test(t) ||
    /^http:\/\/10\./.test(t) ||
    /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./.test(t)
  )
}
