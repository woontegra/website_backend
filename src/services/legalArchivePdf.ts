import { chromium } from 'playwright'
import { formatPdfDateTime } from '../lib/legalArchiveFormat'

const PDF_PRINT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap');
  * { box-sizing: border-box; }
  html, body {
    font-family: 'Noto Sans', 'Segoe UI', sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #0f172a;
    margin: 0;
    padding: 0;
    word-break: normal;
    overflow-wrap: break-word;
  }
  h1 { font-size: 18pt; margin: 0 0 12px; word-break: normal; }
  h2 { font-size: 13pt; margin: 18px 0 8px; font-weight: 700; word-break: normal; }
  h3 { font-size: 11.5pt; margin: 14px 0 6px; font-weight: 700; word-break: normal; }
  p, li, dd, dt, span, strong, em, a {
    word-break: normal;
    overflow-wrap: break-word;
    white-space: normal;
  }
  p { margin: 6px 0; }
  ul, ol { margin: 8px 0 8px 20px; padding: 0; }
  li { margin: 4px 0; }
  .legal-doc, .legal-doc p, .legal-doc li, .legal-doc a, .legal-doc strong {
    word-break: normal;
    overflow-wrap: break-word;
    white-space: normal;
  }
  .legal-block, .legal-buyer-block {
    margin: 12px 0;
    padding: 10px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #f8fafc;
    word-break: normal;
    overflow-wrap: break-word;
  }
  .cert-doc-list { display: flex; flex-direction: column; gap: 12px; margin: 12px 0; }
  .cert-doc-card {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 12px 14px;
    background: #f8fafc;
    page-break-inside: avoid;
  }
  .cert-doc-card h3 { margin: 0 0 10px; font-size: 11pt; }
  .cert-field { margin: 6px 0; font-size: 10.5pt; line-height: 1.45; }
  .cert-field strong { display: inline-block; min-width: 7.5em; color: #334155; }
  .tech-mono {
    font-family: ui-monospace, 'Courier New', monospace;
    font-size: 9.5pt;
    line-height: 1.4;
    word-break: normal;
    overflow-wrap: anywhere;
    white-space: normal;
  }
  .hash-value {
    display: block;
    margin-top: 2px;
    font-family: ui-monospace, 'Courier New', monospace;
    font-size: 9pt;
    line-height: 1.35;
    overflow-wrap: anywhere;
    word-break: normal;
  }
  .muted { color: #475569; font-size: 10pt; }
`

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function wrapPdfHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${PDF_PRINT_CSS}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

/** Snapshot veya sertifika HTML'inden A4 PDF üretir (Unicode / ₺ — Noto Sans). */
export async function renderHtmlToPdfBuffer(title: string, bodyHtml: string): Promise<Buffer> {
  const html = wrapPdfHtml(title, bodyHtml)
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

export async function renderSnapshotContentToPdf(title: string, snapshotHtml: string): Promise<Buffer> {
  const trimmed = snapshotHtml.trim()
  const body = trimmed.startsWith('<') ? trimmed : `<p>${escapeHtml(trimmed)}</p>`
  return renderHtmlToPdfBuffer(title, body)
}

export type CertificateRow = {
  title: string
  fileName: string
  acceptanceCode: string
  sha256: string
  version: number | null
  acceptedAt: string
}

export type CertificateInput = {
  orderNo: string
  packageNo: string
  customerBlockHtml: string
  productLinesHtml: string
  productTypes: string
  paymentReference: string | null
  ipAddress: string | null
  userAgent: string | null
  generatedAt: string
  documents: CertificateRow[]
}

function renderCertificateDocumentCards(documents: CertificateRow[]): string {
  return documents
    .map(
      (d) => `<article class="cert-doc-card">
        <h3>${escapeHtml(d.title)}</h3>
        <p class="cert-field"><strong>Dosya adı:</strong> <span class="tech-mono">${escapeHtml(d.fileName)}</span></p>
        <p class="cert-field"><strong>Onay kodu:</strong><br/><span class="hash-value">${escapeHtml(d.acceptanceCode)}</span></p>
        <p class="cert-field"><strong>SHA256:</strong><br/><span class="hash-value">${escapeHtml(d.sha256)}</span></p>
        <p class="cert-field"><strong>Onay zamanı:</strong> ${escapeHtml(formatPdfDateTime(d.acceptedAt))}</p>
        ${d.version != null ? `<p class="cert-field"><strong>Sürüm:</strong> ${escapeHtml(String(d.version))}</p>` : ''}
      </article>`,
    )
    .join('')
}

export async function renderAcceptanceCertificatePdf(input: CertificateInput): Promise<Buffer> {
  const docCards = renderCertificateDocumentCards(input.documents)
  const generatedLabel = formatPdfDateTime(input.generatedAt)

  const body = `
    <h1>Elektronik Onay Sertifikası</h1>
    <p class="muted">Woontegra yasal belge arşivi — ${escapeHtml(generatedLabel)}</p>
    <h2>Sipariş bilgileri</h2>
    <p><strong>Sipariş no:</strong> ${escapeHtml(input.orderNo)}<br/>
    <strong>Paket no:</strong> ${escapeHtml(input.packageNo)}<br/>
    <strong>Ürün tipi:</strong> ${escapeHtml(input.productTypes || '—')}<br/>
  ${input.paymentReference ? `<strong>Ödeme referansı:</strong> ${escapeHtml(input.paymentReference)}<br/>` : ''}
    <strong>IP:</strong> ${escapeHtml(input.ipAddress || '—')}<br/>
    <strong>User-Agent:</strong> ${escapeHtml(input.userAgent || '—')}</p>
    ${input.customerBlockHtml}
    <h2>Ürün / plan / tutar</h2>
    ${input.productLinesHtml}
    <h2>Onaylanan belgeler</h2>
    <div class="cert-doc-list">${docCards}</div>
    <p class="muted">Her belgenin SHA256 değeri, ilgili PDF dosyasının bütünlük doğrulaması içindir.</p>
  `
  return renderHtmlToPdfBuffer('Elektronik Onay Sertifikası', body)
}
