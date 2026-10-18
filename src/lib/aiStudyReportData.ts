import type { SupabaseClient } from '@supabase/supabase-js'
import type { AIReportData } from './aiStudyReport.ts'
import { fetchSharedTopics } from './sharedTopicsData.ts'

export const AI_REPORT_TABLES = {
  exams: 'exams', subjects: 'subjects', resources: 'resources', sessions: 'study_sessions',
  weeklyPlans: 'weekly_plans', planItems: 'plan_items', videos: 'video_plan_items',
  questionPlans: 'question_plans', questionLogs: 'question_session_results',
  results: 'exam_results', answers: 'exam_result_details', questionTypes: 'exam_question_types', topics: 'topics',
} as const

/** Read every page. A partial/error response must never look like a complete personal report. */
export async function readOwnedReportRows(client: SupabaseClient, table: string, userId: string) {
  if (!userId) throw new Error('Hesap seçilmedi.')
  const rows: { id: string; user_id: string }[] = []
  const size = 500
  let expected: number | null = null
  for (let start = 0; ; start += size) {
    const { data, error, count } = await client.from(table).select('*', start === 0 ? { count: 'exact' } : {})
      .eq('user_id', userId).order('id').range(start, start + size - 1)
    if (error) {
      const setup = ['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code)
        ? table.startsWith('question_') ? ' Supabase’de güncel question_plans.sql dosyasını çalıştırın.' : ' Bu bölümün veritabanı kurulumunu kontrol edin.' : ''
      throw new Error(`${table} verileri okunamadı (${error.code || 'bağlantı'}).${setup} Eksik JSON oluşturulmadı; tekrar deneyin.`)
    }
    if (!data || data.some(row => !row.id || row.user_id !== userId)) throw new Error(`${table} verileri doğrulanamadı. Tekrar deneyin.`)
    if (start === 0) expected = count
    rows.push(...data)
    if (data.length < size || expected !== null && rows.length >= expected) break
  }
  if (expected === null || new Set(rows.map(row => row.id)).size !== expected || rows.length !== expected) {
    throw new Error(`${table} verileri okunurken değişti veya eksik geldi. JSON oluşturulmadı; tekrar deneyin.`)
  }
  return rows
}

export async function fetchAIReportData(client: SupabaseClient, userId: string): Promise<AIReportData> {
  const entries = await Promise.all(Object.entries(AI_REPORT_TABLES).map(async ([key, table]) => [key, await readOwnedReportRows(client, table, userId)]))
  const report = Object.fromEntries(entries) as AIReportData
  try {
    const shared = await fetchSharedTopics(client, userId)
    report.topics.push(...shared.topics.filter(topic => !topic.archived_at).map(topic => ({
      id: `shared:${topic.id}`, subject_id: `shared:${topic.subject_id}`,
      subject_name: shared.subjects.find(subject => subject.id === topic.subject_id)?.name || 'AGS dersi',
      title: topic.title, source: 'shared_ags' as const,
      is_completed: shared.progress.find(progress => progress.topic_id === topic.id)?.is_completed === true,
    })))
    report.sharedTopicsAvailability = 'available'
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (!['42P01', '42703', 'PGRST204', 'PGRST205'].includes(code)) throw new Error('Ortak AGS konu verileri okunamadı. Eksik AI raporu oluşturulmadı; tekrar dene.')
    report.sharedTopicsAvailability = 'not_installed'
  }
  return report
}
