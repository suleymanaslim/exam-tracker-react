import { supabase } from './supabase'
import { withQuestionProgress } from './questionPlan'
import { withWeeklyQuestionProgress } from './questionAnalytics'
import type { QuestionPlan, QuestionLog, QuestionVideo } from './questionPlan'

async function readPages(table: 'question_plans' | 'question_session_results', columns: string, userId: string) {
  const rows: unknown[] = []
  const size = 500
  for (let start = 0; ; start += size) {
    const response = await supabase.from(table).select(columns).eq('user_id', userId)
      .order('created_at').order('id').range(start, start + size - 1)
    if (response.error) throw response.error
    const page = response.data || []
    rows.push(...page)
    if (page.length < size) return rows
  }
}
export async function fetchQuestionData(userId: string) {
  const [raw, results] = await Promise.all([
    readPages('question_plans', '*,subjects(name,exam_id),resources(name)', userId),
    readPages('question_session_results', '*', userId),
  ])
  const logs = (results as QuestionLog[]).filter(log => !log.deleted_at)
  const plans = withWeeklyQuestionProgress(withQuestionProgress(raw as QuestionPlan[], logs), logs)
    .sort((a, b) => b.date.localeCompare(a.date))
  return { plans, logs }
}
export async function fetchQuestionPlans(userId: string): Promise<QuestionPlan[]> {
  return (await fetchQuestionData(userId)).plans.filter(plan => !plan.archived_at)
}
export function questionPlanError(error: { code?: string; message?: string }) {
  return ['42P01', '42703', 'PGRST204', 'PGRST205', 'PGRST202'].includes(error.code || '')
    ? 'Soru planı için Supabase’de güncel question_plans.sql dosyasını çalıştırın.'
    : error.code === '42501' ? 'Bu hesabın soru planını düzenleme izni bulunmuyor.' : 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'
}
export async function fetchQuestionVideos(userId: string): Promise<QuestionVideo[]> {
  const rows: QuestionVideo[] = []
  const size = 500
  for (let start = 0; ; start += size) {
    const { data, error } = await supabase.from('video_plan_items').select('*,resources(name,subject_id,subjects(name,exam_id))')
      .eq('user_id', userId).order('date', { ascending: false }).order('id').range(start, start + size - 1)
    if (error) throw error
    const page = (data || []) as QuestionVideo[]
    rows.push(...page)
    if (page.length < size) return rows
  }
}
