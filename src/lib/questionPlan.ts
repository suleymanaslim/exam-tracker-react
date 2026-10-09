export const QUESTION_PRESETS = [15, 20, 30, 45] as const
export interface QuestionPlan {
  id: string
  user_id: string
  video_plan_item_id: string | null
  subject_id: string | null
  resource_id: string | null
  date: string
  period?: 'day' | 'week'
  archived_at?: string | null
  target_questions: number | null
  subjects?: { name: string; exam_id: string } | null
  resources?: { name: string } | null
  solved_questions: number
  correct_questions: number
  wrong_questions: number
  answers_recorded: boolean
  correct_recorded: boolean
  wrong_recorded: boolean
}
export interface QuestionResult {
  question_plan_id: string
  solved_questions: number
  correct_questions?: number | null
  wrong_questions?: number | null
  note?: string | null
  created_at?: string
  deleted_at?: string | null
}
export interface QuestionLog extends QuestionResult {
  id: string
  session_id: string | null
  created_at: string
}

export function questionCount(value: unknown, allowZero = false): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null
  const number = Number(value)
  return Number.isInteger(number) && number >= (allowZero ? 0 : 1) && number <= 100000 ? number : null
}

// Quick choices cover the upper half of the goal, always in multiples of five.
export function solvedQuestionPresets(target?: number | null): number[] {
  if (!target || questionCount(target) === null) return [5, 10, 15, 20, 30, 45]
  const lower = Math.ceil(target / 2 / 5) * 5
  const upper = Math.floor(target / 5) * 5
  const step = Math.max(5, Math.ceil((upper - lower) / 7 / 5) * 5)
  const values: number[] = []
  for (let count = lower; count <= upper; count += step) values.push(count)
  if (upper >= lower && values.at(-1) !== upper) values.push(upper)
  return values
}
export function completedVideo(item: { video_count: number; watched_count?: number | null; is_completed?: boolean | null }) {
  return item.is_completed === true || (item.video_count > 0 && (item.watched_count || 0) >= item.video_count)
}
export function withQuestionProgress<T extends { id: string }>(plans: T[], results: QuestionResult[]) {
  const counts = new Map<string, { solved_questions: number; correct_questions: number; wrong_questions: number; answers_recorded: boolean; correct_recorded: boolean; wrong_recorded: boolean }>()
  for (const result of results) {
    if (result.deleted_at) continue
    const value = counts.get(result.question_plan_id) || { solved_questions: 0, correct_questions: 0, wrong_questions: 0, answers_recorded: false, correct_recorded: false, wrong_recorded: false }
    value.solved_questions += result.solved_questions
    value.correct_questions += result.correct_questions || 0
    value.wrong_questions += result.wrong_questions || 0
    value.correct_recorded ||= result.correct_questions != null
    value.wrong_recorded ||= result.wrong_questions != null
    value.answers_recorded ||= result.correct_questions != null || result.wrong_questions != null
    counts.set(result.question_plan_id, value)
  }
  return plans.map(plan => ({ ...plan, ...(counts.get(plan.id) || { solved_questions: 0, correct_questions: 0, wrong_questions: 0, answers_recorded: false, correct_recorded: false, wrong_recorded: false }) }))
}
export function openQuestionPlans(plans: QuestionPlan[], today: string) {
  const start = new Date(`${today}T00:00:00`)
  start.setDate(start.getDate() - (start.getDay() + 6) % 7)
  const monday = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  return plans.filter(plan => !plan.archived_at && (plan.period === 'week'
    ? plan.date === monday
    : plan.date === today || (plan.date < today && plan.target_questions != null && plan.solved_questions < plan.target_questions)))
}
export function questionAnswers(total: unknown, correct: unknown = '', wrong: unknown = '') {
  const solved = questionCount(total, true)
  const right = correct == null || correct === '' ? null : questionCount(correct, true)
  const incorrect = wrong == null || wrong === '' ? null : questionCount(wrong, true)
  if (solved === null || (correct != null && correct !== '' && right === null)
    || (wrong != null && wrong !== '' && incorrect === null) || (right || 0) + (incorrect || 0) > solved) return null
  return { solved_questions: solved, correct_questions: right, wrong_questions: incorrect }
}
export interface QuestionVideo {
  id: string; date: string; resource_id: string; video_count: number
  watched_count?: number; is_completed?: boolean
  resources: { name: string; subject_id: string; subjects: { name: string; exam_id: string } | null } | null
}

// Used when answer fields are edited; unedited historical records retain their total.
export function questionEntryAnswers(total: unknown, correct: unknown = '', wrong: unknown = '') {
  const hasAnswers = correct != null && correct !== '' || wrong != null && wrong !== ''
  if (!hasAnswers) return questionAnswers(total)
  const answers = questionAnswers(100000, correct, wrong)
  if (!answers) return null
  return questionAnswers((answers.correct_questions || 0) + (answers.wrong_questions || 0), correct, wrong)
}
export function questionNote(value: unknown): string | null | undefined {
  if (value == null) return null
  if (typeof value !== 'string' || value.length > 1000) return undefined
  return value.trim() || null
}
export function questionNoteSuggestions(values: (string | null | undefined)[], limit = 50): string[] {
  const seen = new Set<string>(), notes: string[] = []
  for (const value of values) {
    const note = questionNote(value)
    if (!note) continue
    const key = note.toLocaleLowerCase('tr-TR')
    if (seen.has(key)) continue
    seen.add(key); notes.push(note)
    if (notes.length >= limit) break
  }
  return notes
}
