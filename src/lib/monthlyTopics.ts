export interface SharedSubject { id: string; name: string; sort_order: number }
export interface SharedTopic { id: string; subject_id: string; title: string; sort_order: number; archived_at: string | null }
export interface SharedTopicProgress { user_id: string; topic_id: string; is_completed: boolean }
export interface MonthlyTarget { id: string; owner_id: string; shared_topic_id: string | null; personal_topic_id: string | null; target_month: string; note: string | null }
export interface MonthlyTopic { key: string; id: string; kind: 'shared' | 'personal'; subjectKey: string; subject: string; exam: string; title: string; completed: boolean; archived: boolean }

export function monthKey(value: string) {
  return /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value) ? value : null
}
export function shiftMonth(month: string, offset: number) {
  if (!monthKey(month)) throw new Error('Geçerli bir ay seç.')
  const date = new Date(`${month}-01T12:00:00`); date.setMonth(date.getMonth() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
export function monthLabel(month: string) {
  return new Date(`${month.slice(0, 7)}-01T12:00:00`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}
export function readTopicTitles(text: string) {
  const seen = new Set<string>()
  const titles = text.split(/\r?\n/).map(title => title.trim()).filter(Boolean).filter(title => {
    const key = title.replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR')
    if (seen.has(key)) return false
    seen.add(key); return true
  })
  if (!titles.length || titles.length > 500 || titles.some(title => title.length > 500)) throw new Error('Her satıra bir konu yaz. En fazla 500 konu ve konu başına 500 karakter ekleyebilirsin.')
  return titles
}
export function monthlyPayload(topics: MonthlyTopic[], keys: string[], month: string, note = '') {
  if (!monthKey(month)) throw new Error('2000–2100 arasında geçerli bir ay seç.')
  if (note.length > 1000) throw new Error('Not en fazla 1000 karakter olabilir.')
  const selected = [...new Set(keys)].map(key => topics.find(topic => topic.key === key))
  if (!selected.length || selected.length > 500 || selected.some(topic => !topic || topic.archived)) throw new Error('En az bir aktif konu seç. Tek seferde en fazla 500 konu planlayabilirsin.')
  return selected.map(topic => ({ kind: topic!.kind, topic_id: topic!.id, month, note: note.trim() || null }))
}
export function monthlyTargetKey(target: MonthlyTarget) {
  return target.shared_topic_id ? `shared:${target.shared_topic_id}` : `personal:${target.personal_topic_id}`
}
export function sharedTopicsError(error: { code?: string } | unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code)) return 'Bu bölüm için Supabase’de shared_ags_topics_monthly.sql dosyasını çalıştırın.'
  if (code === '42501') return 'Bu işlem için yetkin bulunmuyor. Ortak başlıkları ve aylık planı yalnızca admin düzenleyebilir.'
  if (code === '23505') return 'Bu isimde bir ders veya konu zaten var.'
  if (code === '22023') return 'Konu, ders veya ay bilgisini kontrol et. Hiçbir kayıt değiştirilmedi.'
  return 'İşlem tamamlanamadı. Lütfen tekrar dene.'
}
