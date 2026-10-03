const placeholders = new Set(['kullanici', 'user', 'isimsiz', 'bilinmeyen'])
export function actualProfileName(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const name = value.trim().replace(/\s+/g, ' ')
    const normalized = name.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i')
    if (name && !placeholders.has(normalized)) return name
  }
  return null
}
export function profileNameLabel(name: unknown, email?: string | null): string {
  return actualProfileName(name) || email?.split('@')[0] || 'Ad belirtilmemiş'
}
