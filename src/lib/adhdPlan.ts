// DEHB haftalık planı için saf yardımcılar (veritabanına dokunmaz).
// Ders kimlikleri kişiye özel olduğundan kopyalar ve setler ders ADIYLA taşınır.

/** topic_title: kopyalanan dersin konusu. Setlerde boş kalır; konu uygulanırken sıradakinden seçilir. */
export interface TemplateItem { day: number; subject_name: string; note: string | null; topic_title?: string | null }
export interface NamedSubject { id: string; name: string; ags?: boolean }
export type TopicKind = 'personal' | 'shared'
export interface CatalogTopic { kind: TopicKind; id: string; title: string; completed: boolean }
/** Kişinin ders kimliği → sıralı konu listesi */
export type TopicCatalog = Map<string, CatalogTopic[]>
export interface TaskRow {
  user_id: string; task_date: string; subject_id: string; note: string | null; sort_order: number
  topic_kind: TopicKind | null; topic_id: string | null; topic_title: string | null
}

export const topicKey = (kind: string, id: string) => `${kind}:${id}`

/** Sıradaki konu: bitmemiş ve henüz (bugünden sonrası için) planlanmamış ilk konu. */
export function nextTopic(topics: CatalogTopic[] | undefined, taken: Set<string>) {
  return topics?.find(topic => !topic.completed && !taken.has(topicKey(topic.kind, topic.id))) ?? null
}

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
export function tasksToTemplate(tasks: { task_date: string; note: string | null; topic_title?: string | null; subjects?: { name: string } | null }[], dayKeys: string[], keepTopics = true): TemplateItem[] {
  return tasks.flatMap(task => {
    const day = dayKeys.indexOf(task.task_date) + 1
    const name = task.subjects?.name
    return day > 0 && name ? [{ day, subject_name: name, note: task.note, ...(keepTopics && task.topic_title ? { topic_title: task.topic_title } : {}) }] : []
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
 * Konular: şablonda konu adı varsa ve kişide bitmemiş aynı adlı konu varsa o kullanılır;
 * yoksa dersin sıradaki konusu atanır. taken: zaten planlanmış konular (güncellenir).
 */
export function templateToRows(items: TemplateItem[], options: {
  userId: string; dayKeys: string[]; subjects: Map<string, string>; existing?: Record<string, number>; targetDay?: number
  catalog?: TopicCatalog; taken?: Set<string>
}) {
  const counts: Record<string, number> = { ...(options.existing || {}) }
  const taken = options.taken ?? new Set<string>()
  const rows: TaskRow[] = []
  const missing = new Set<string>()
  // Konular takvim sırasıyla ilerlesin diye günlere göre sıralanır (aynı gün içinde sıra korunur).
  const ordered = items.map((item, index) => ({ item, index })).sort((a, b) => (options.targetDay ?? a.item.day) - (options.targetDay ?? b.item.day) || a.index - b.index)
  for (const { item } of ordered) {
    const day = options.targetDay ?? item.day
    const date = options.dayKeys[day - 1]
    const subjectId = options.subjects.get(normalizeSubjectName(item.subject_name))
    if (!date) continue
    if (!subjectId) { missing.add(item.subject_name); continue }
    const topics = options.catalog?.get(subjectId)
    const wanted = item.topic_title ? normalizeSubjectName(item.topic_title) : ''
    const topic = (wanted && topics?.find(candidate => !candidate.completed && normalizeSubjectName(candidate.title) === wanted)) || nextTopic(topics, taken)
    if (topic) taken.add(topicKey(topic.kind, topic.id))
    rows.push({
      user_id: options.userId, task_date: date, subject_id: subjectId, note: item.note, sort_order: counts[date] ?? 0,
      topic_kind: topic?.kind ?? null, topic_id: topic?.id ?? null, topic_title: topic?.title ?? null,
    })
    counts[date] = (counts[date] ?? 0) + 1
  }
  return { rows, missing: [...missing] }
}
