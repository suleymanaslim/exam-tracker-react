// DEHB haftalık planı için saf yardımcılar (veritabanına dokunmaz).
// Ders kimlikleri kişiye özel olduğundan kopyalar ve setler ders ADIYLA taşınır.

export interface TemplateItem { day: number; subject_name: string; note: string | null }
export interface NamedSubject { id: string; name: string; ags?: boolean }
export interface TaskRow { user_id: string; task_date: string; subject_id: string; note: string | null; sort_order: number }

export const normalizeSubjectName = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR')

/** Ad → ders kimliği. Aynı adda birden fazla ders varsa AGS dersi tercih edilir. */
export function subjectIndex(subjects: NamedSubject[]) {
  const index = new Map<string, string>()
  for (const subject of [...subjects].sort((a, b) => Number(Boolean(b.ags)) - Number(Boolean(a.ags)))) {
    const key = normalizeSubjectName(subject.name)
    if (key && !index.has(key)) index.set(key, subject.id)
  }
  return index
}

/** Haftanın 7 günü (Pzt→Paz) için YYYY-MM-DD anahtarları. */
export function weekDayKeys(monday: string) {
  const [y, m, d] = monday.split('-').map(Number)
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(y, m - 1, d + i, 12)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })
}

/** Mevcut görevleri ders adıyla şablona çevirir. */
export function tasksToTemplate(tasks: { task_date: string; note: string | null; subjects?: { name: string } | null }[], dayKeys: string[]): TemplateItem[] {
  return tasks.flatMap(task => {
    const day = dayKeys.indexOf(task.task_date) + 1
    const name = task.subjects?.name
    return day > 0 && name ? [{ day, subject_name: name, note: task.note }] : []
  })
}

/** Normal haftalık plan maddelerini (plan_items) şablona çevirir; dersi olmayanlar atlanır. */
export function planItemsToTemplate(items: { day_of_week: number; subject_id: string | null; title: string | null; sort_order?: number }[], subjectNames: Record<string, string>) {
  let skipped = 0
  const result: TemplateItem[] = []
  for (const item of [...items].sort((a, b) => a.day_of_week - b.day_of_week || (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
    const name = item.subject_id ? subjectNames[item.subject_id] : undefined
    if (!name || item.day_of_week < 1 || item.day_of_week > 7) { skipped++; continue }
    result.push({ day: item.day_of_week, subject_name: name, note: item.title?.trim().slice(0, 200) || null })
  }
  return { items: result, skipped }
}

/**
 * Şablonu kişinin görev satırlarına çevirir.
 * targetDay verilirse (gün yapıştırma) tüm maddeler o güne konur.
 * existing: tarih → o gündeki mevcut görev sayısı (yeni maddeler sona eklenir).
 */
export function templateToRows(items: TemplateItem[], options: { userId: string; dayKeys: string[]; subjects: Map<string, string>; existing?: Record<string, number>; targetDay?: number }) {
  const counts: Record<string, number> = { ...(options.existing || {}) }
  const rows: TaskRow[] = []
  const missing = new Set<string>()
  for (const item of items) {
    const day = options.targetDay ?? item.day
    const date = options.dayKeys[day - 1]
    const subjectId = options.subjects.get(normalizeSubjectName(item.subject_name))
    if (!date) continue
    if (!subjectId) { missing.add(item.subject_name); continue }
    rows.push({ user_id: options.userId, task_date: date, subject_id: subjectId, note: item.note, sort_order: counts[date] ?? 0 })
    counts[date] = (counts[date] ?? 0) + 1
  }
  return { rows, missing: [...missing] }
}
