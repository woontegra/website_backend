/** Yasal metin içinde {{placeholder}} değiş tokuşu; kalan şablon etiketleri kaldırılır (kullanıcıya ham {{}} gösterilmez) */
export function renderLegalTemplate(content: string, vars: Record<string, string>): string {
  let out = content
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v)
  }
  out = out.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '')
  return out
}
