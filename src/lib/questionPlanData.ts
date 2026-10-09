import { localDayKey } from './statsPeriod'
import { supabase } from './supabase'
import { withQuestionProgress, completedVideo } from './questionPlan'
import type { QuestionPlan, QuestionResult, CompletedQuestionVideo } from './questionPlan'

// Supabase caps each response; paginate so older results stay in lifetime totals.
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
export async function fetchQuestionPlans(userId: string): Promise<QuestionPlan[]> {
  const [plans, results] = await Promise.all([
    readPages('question_plans', '*,subjects(name,exam_id),resources(name)', userId),
    readPages('question_session_results', 'question_plan_id,solved_questions,correct_questions,wrong_questions', userId),
  ])
  return withQuestionProgress(plans as QuestionPlan[], results as QuestionResult[]).sort((a, b) => b.date.localeCompare(a.date))
}
export function questionPlanError(error: { code?: string; message?: string }) {
  return ['42P01', 'PGRST205', 'PGRST202'].includes(error.code || '')
    ? 'Soru planı henüz kurulmamış. Supabase’de question_plans.sql dosyasını çalıştırın.'
    : error.code === '42501' ? 'Bu hesabın soru planını düzenleme izni bulunmuyor.' : 'Soru planı yüklenemedi. Lütfen tekrar deneyin.'
}

export async function fetchCompletedQuestionVideos(userId: string): Promise<CompletedQuestionVideo[]> {
  const rows: CompletedQuestionVideo[] = []
  const today = localDayKey(new Date())
  const size = 500
  for (let start = 0; ; start += size) {
    const { data, error } = await supabase.from('video_plan_items').select('*,resources(name,subject_id,subjects(name,exam_id))')
      .eq('user_id', userId).lte('date', today).order('date', { ascending: false }).order('id').range(start, start + size - 1)
    if (error) throw error
    const page = (data || []) as CompletedQuestionVideo[]
    rows.push(...page.filter(completedVideo))
    if (page.length < size) return rows
  }
}
