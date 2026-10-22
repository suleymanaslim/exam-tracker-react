import type { QuestionLog, QuestionPlan } from './questionPlan.ts'

export interface StudyHistorySession {
  id: string; subject_id: string | null; resource_id: string | null
  session_type: string; started_at: string; ended_at: string
  duration_minutes: number; note: string | null; is_edited: boolean
}
export interface HistoryEntry extends StudyHistorySession { question?: QuestionLog }

/** A timed solution is one row; manual solutions have no invented study time. */
export function mergeHistoryEntries(sessions: StudyHistorySession[], plans: QuestionPlan[], logs: QuestionLog[]): HistoryEntry[] {
  const plansById = new Map(plans.map(plan => [plan.id, plan]))
  const bySession = new Map(logs.filter(log => !log.deleted_at && log.session_id).map(log => [log.session_id, log]))
  const entries: HistoryEntry[] = sessions.map(session => ({ ...session, question: bySession.get(session.id) }))
  for (const log of logs) {
    if (log.deleted_at || log.session_id) continue
    const plan = plansById.get(log.question_plan_id)
    entries.push({ id: `question:${log.id}`, subject_id: plan?.subject_id || null, resource_id: plan?.resource_id || null,
      session_type: 'question_solve', started_at: log.created_at, ended_at: log.created_at,
      duration_minutes: 0, note: log.note || null, is_edited: false, question: log })
  }
  return entries.sort((a, b) => b.started_at.localeCompare(a.started_at))
}
