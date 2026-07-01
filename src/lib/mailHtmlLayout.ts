/** Ortak transactional e-posta HTML iskeleti */

export function escapeMailHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function mailHtmlDocument(title: string, bodyHtml: string): string {
  const safeTitle = escapeMailHtml(title)
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%);padding:20px 28px;">
              <div style="font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:rgba(255,255,255,0.85);">Woontegra</div>
              <div style="margin-top:6px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">${safeTitle}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">${bodyHtml}</td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">
                Bu e-posta Woontegra sipariş sistemi tarafından otomatik gönderilmiştir.<br/>
                Sorularınız için <a href="mailto:info@woontegra.com" style="color:#2563eb;text-decoration:none;">info@woontegra.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function mailInfoTable(rows: { label: string; value: string; mono?: boolean }[]): string {
  const trs = rows
    .map(
      (r) => `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;width:38%;font-size:13px;font-weight:600;color:#475569;vertical-align:top;">${escapeMailHtml(r.label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;vertical-align:top;${r.mono ? 'font-family:Consolas,Monaco,monospace;' : ''}">${r.value}</td>
      </tr>`,
    )
    .join('')
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:16px 0;">${trs}</table>`
}

export function mailBadge(text: string, tone: 'blue' | 'amber' | 'green' = 'blue'): string {
  const colors = {
    blue: { bg: '#eff6ff', fg: '#1d4ed8', border: '#bfdbfe' },
    amber: { bg: '#fffbeb', fg: '#b45309', border: '#fde68a' },
    green: { bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0' },
  }[tone]
  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;background:${colors.bg};color:${colors.fg};border:1px solid ${colors.border};">${escapeMailHtml(text)}</span>`
}

/** Hoş geldin / hesap oluşturma e-postası — logo ve kurumsal üst bilgi alanı */
export function mailWelcomeHtmlDocument(options: {
  title: string
  bodyHtml: string
  logoUrl?: string | null
  footerHtml?: string
}): string {
  const safeTitle = escapeMailHtml(options.title)
  const logoUrl = options.logoUrl?.trim()
  const brandBlock = logoUrl
    ? `<img src="${escapeMailHtml(logoUrl)}" alt="Woontegra" width="150" style="display:block;max-width:150px;height:auto;border:0;outline:none;" />`
    : `<div style="font-size:20px;font-weight:800;letter-spacing:0.06em;color:#ffffff;">WOONTEGRA</div>`

  const footer =
    options.footerHtml ??
    `<p style="margin:0;font-size:12px;line-height:1.65;color:#64748b;">
      Bu e-posta Woontegra müşteri hesabı sistemi tarafından otomatik gönderilmiştir.<br/>
      Sorularınız için <a href="mailto:info@woontegra.com" style="color:#2563eb;text-decoration:none;">info@woontegra.com</a>
    </p>`

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f7;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbe3ef;box-shadow:0 8px 32px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1e40af 0%,#2563eb 55%,#3b82f6 100%);padding:28px 32px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left">${brandBlock}</td>
                </tr>
                <tr>
                  <td style="padding-top:18px;">
                    <div style="font-size:13px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:rgba(255,255,255,0.82);">Müşteri hesabı</div>
                    <div style="margin-top:6px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.25;">${safeTitle}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                <tr>
                  <td style="padding:24px 22px;">${options.bodyHtml}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;">
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
