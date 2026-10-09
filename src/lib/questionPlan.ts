export const QUESTION_PRESETS = [15, 20, 30, 45] as const
export interface QuestionPlan {
  id: string
  user_id: string
  video_plan_item_id: string | null
  subject_id: string | null
  resource_id: string | null
  date: string
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
export interface QuestionResult { question_plan_id: string; solved_questions: number; correct_questions?: number | null; wrong_questions?: number | null }

export function questionCount(value: unknown, allowZero = false): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null
  const number = Number(value)
  return Number.isInteger(number) && number >= (allowZero ? 0 : 1) && number <= 100000 ? number : null
}
export function completedVideo(item: { video_count: number; watched_count?: number | null; is_completed?: boolean | null }) {
  return item.is_completed === true || (item.video_count > 0 && (item.watched_count || 0) >= item.video_count)
}
export function withQuestionProgress<T extends { id: string }>(plans: T[], results: QuestionResult[]) {
  const counts = new Map<string, { solved_questions: number; correct_questions: number; wrong_questions: number; answers_recorded: boolean; correct_recorded: boolean; wrong_recorded: boolean }>()
  for (const result of results) {
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
  return plans.filter(plan => plan.date === today || (plan.date < today && plan.target_questions != null && plan.solved_questions < plan.target_questions))
}

export function questionAnswers(total: unknown, correct: unknown = '', wrong: unknown = '') {
  const solved = questionCount(total, true)
  const right = correct == null || correct === '' ? null : questionCount(correct, true)
  const incorrect = wrong == null || wrong === '' ? null : questionCount(wrong, true)
  if (solved === null || (correct != null && correct !== '' && right === null)
    || (wrong != null && wrong !== '' && incorrect === null) || (right || 0) + (incorrect || 0) > solved) return null
  return { solved_questions: solved, correct_questions: right, wrong_questions: incorrect }
}

export interface CompletedQuestionVideo {
  id: string; date: string; resource_id: string; video_count: number
  watched_count?: number; is_completed?: boolean
  resources: { name: string; subject_id: string; subjects: { name: string; exam_id: string } | null } | null
}
