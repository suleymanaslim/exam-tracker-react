// DEHB haftalık planı için saf yardımcılar (veritabanına dokunmaz).
// Ders kimlikleri kişiye özel olduğundan kopyalar ve setler ders ADIYLA taşınır.

/** topic_title: kopyalanan dersin konusu. Setlerde boş kalır; konu uygulanırken sıradakinden seçilir. */
/** questions: soru çözümü maddesi (konusuz; kişide bu adda ders yoksa adıyla eklenir) */
export interface TemplateItem { day: number; subject_name: string; note: string | null; topic_title?: string | null; questions?: boolean }
export interface NamedSubject { id: string; name: string; ags?: boolean }
export type TopicKind = 'personal' | 'shared'
export interface CatalogTopic { kind: TopicKind; id: string; title: string; completed: boolean }
/** Kişinin ders kimliği → sıralı konu listesi */
export type TopicCatalog = Map<string, CatalogTopic[]>
export interface TaskRow {
  user_id: string; task_date: string; subject_id: string | null; note: string | null; sort_order: number
  topic_kind: TopicKind | null; topic_id: string | null; topic_title: string | null
  title?: string | null; is_questions?: boolean
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
export function tasksToTemplate(tasks: { task_date: string; note: string | null; topic_title?: string | null; title?: string | null; is_questions?: boolean; subjects?: { name: string } | null }[], dayKeys: string[], keepTopics = true): TemplateItem[] {
  return tasks.flatMap((task): TemplateItem[] => {
    const day = dayKeys.indexOf(task.task_date) + 1
    const name = task.subjects?.name || task.title
    if (day <= 0 || !name) return [] as TemplateItem[]
    if (task.is_questions) return [{ day, subject_name: name, note: task.note, questions: true }]
    return [{ day, subject_name: name, note: task.note, ...(keepTopics && task.topic_title ? { topic_title: task.topic_title } : {}) }]
  })
}

/** Hazır sete eklenen soru çözümü maddeleri → şablon (her seçili gün için bir madde). */
export const QUESTIONS_NOTE = 'Soru çözümü'
export function questionItemsToTemplate(items: { label: string; days: number[] }[]): TemplateItem[] {
  return items.flatMap(item => [...new Set(item.days)].filter(day => day >= 1 && day <= 7).sort((a, b) => a - b)
    .map(day => ({ day, subject_name: item.label.trim(), note: QUESTIONS_NOTE, questions: true })))
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
    if (item.questions) {
      // Soru çözümü konusuzdur; kişide bu adda ders yoksa yalnızca adıyla eklenir.
      rows.push({ user_id: options.userId, task_date: date, subject_id: subjectId ?? null, note: item.note, sort_order: counts[date] ?? 0,
        topic_kind: null, topic_id: null, topic_title: null, title: subjectId ? null : item.subject_name, is_questions: true })
      counts[date] = (counts[date] ?? 0) + 1
      continue
    }
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

// ── Hazır ideal set ────────────────────────────────────────────────────────
export const IDEAL_NOTE = 'Konuyu çalış + 10 soru çöz'
const DEFAULT_WEEKS = 12

export interface IdealWeek {
  items: TemplateItem[]
  /** Konuların bitmesi için gereken haftalık ders sayısı (tavan uygulanmadan önce) */
  needed: number
  perWeek: number
  studyWeeks: number
  weeksLeft: number
  remaining: number
  fits: boolean
  examKnown: boolean
}

/**
 * Sınava kalan haftaya göre ideal haftayı kurar:
 * - Son hafta tekrar haftası olarak boş bırakılır (4+ hafta kaldıysa).
 * - Her ders, kalan konusu bitecek kadar (haftalık) ders alır; konusu kalan her derse en az 1 ders.
 * - Pzt–Cmt'ye dağıtılır, Pazar dinlenme. DEHB'ye uygun olarak günde 3, gerekirse en fazla 4 ders.
 * - Aynı gün aynı ders tekrarlanmasın diye dersler sırayla karıştırılır.
 */
export function buildIdealWeek(subjects: { name: string; remaining: number }[], monday: string, examDate?: string | null, options: { days?: number; maxPerDay?: number; minPerDay?: number } = {}): IdealWeek {
  const days = options.days ?? 6, maxPerDay = options.maxPerDay ?? 4, minPerDay = options.minPerDay ?? 2
  const examKnown = Boolean(examDate) && examDate! > monday
  const weeksLeft = examKnown ? Math.floor((Date.parse(`${examDate}T12:00:00`) - Date.parse(`${monday}T12:00:00`)) / (7 * 864e5)) : DEFAULT_WEEKS
  const studyWeeks = Math.max(1, weeksLeft >= 4 ? weeksLeft - 1 : weeksLeft)
  const active = subjects.filter(subject => subject.remaining > 0)
  const quotas = active.map(subject => ({ name: subject.name, count: Math.max(1, Math.ceil(subject.remaining / studyWeeks)) }))
  const needed = quotas.reduce((sum, quota) => sum + quota.count, 0)
  // Önce günde 3'e sığdırmayı dene; konular yetişmiyorsa günde 4'e kadar çık.
  const cap = Math.min(needed, days * (needed <= days * 3 ? 3 : maxPerDay))
  // Fazlası varsa en çok konusu kalan derslerden başlayarak kırp.
  let excess = needed - cap
  while (excess > 0) {
    const biggest = [...quotas].sort((a, b) => b.count - a.count)[0]
    biggest.count--; excess--
  }
  // Her çalışma gününde en az 2 ders olsun: eksikse konusu en çok kalan derslerden sırayla ekle.
  // Konusu kalan ders 2'den azsa, konusu biten dersler tekrar dersi olarak havuza girer.
  const pool = [...quotas]
  if (pool.length < minPerDay) {
    for (const subject of [...subjects].filter(subject => subject.remaining <= 0)) {
      if (pool.length >= minPerDay) break
      if (!pool.some(quota => quota.name === subject.name)) { const quota = { name: subject.name, count: 0 }; pool.push(quota); quotas.push(quota) }
    }
  }
  const remainingOf = (name: string) => subjects.find(subject => subject.name === name)?.remaining ?? 0
  let total = quotas.reduce((sum, quota) => sum + quota.count, 0)
  while (pool.length && total < days * minPerDay) {
    // Aynı gün tekrarı olmasın diye bir ders haftada en fazla `days` kez alınır (mümkünse).
    const open = pool.filter(quota => quota.count < days)
    const candidates = open.length ? open : pool
    const pick = [...candidates].sort((a, b) => (remainingOf(b.name) + 1) / (b.count + 1) - (remainingOf(a.name) + 1) / (a.count + 1))[0]
    pick.count++; total++
  }
  // Günlere yerleştir: her ders en az yüklü ve birbirinden uzak günlere gider (aynı gün tekrar etmez).
  const load = Array.from({ length: days }, () => 0)
  const byDay: string[][] = Array.from({ length: days }, () => [])
  for (const quota of [...quotas].sort((a, b) => b.count - a.count)) {
    const chosen: number[] = []
    for (let n = 0; n < quota.count; n++) {
      const distance = (day: number) => chosen.length ? Math.min(...chosen.map(other => Math.abs(other - day))) : days
      const day = Array.from({ length: days }, (_, i) => i).sort((a, b) =>
        Number(chosen.includes(a)) - Number(chosen.includes(b)) || load[a] - load[b] || distance(b) - distance(a) || a - b)[0]
      chosen.push(day); load[day]++; byDay[day].push(quota.name)
    }
  }
  const items: TemplateItem[] = byDay.flatMap((names, i) => names.map(name => ({ day: i + 1, subject_name: name, note: IDEAL_NOTE })))
  const sequence = items
  return { items, needed, perWeek: sequence.length, studyWeeks, weeksLeft, remaining: active.reduce((sum, subject) => sum + subject.remaining, 0), fits: needed <= cap, examKnown }
}
