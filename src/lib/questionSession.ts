import type { RecoverySession } from './timerRecovery.ts'
import { questionAnswers, questionNote } from './questionPlan.ts'
import { localDayKey } from './statsPeriod.ts'

export function questionSessionPayload(session: RecoverySession) {
  const answers = questionAnswers(session.solvedQuestions, session.correctQuestions, session.wrongQuestions)
  const note = questionNote(session.questionNote)
  if (note === undefined) throw new Error('Konu/not en fazla 1000 karakter olabilir.')
  if (session.mode !== 'questions' || !answers || session.durationMinutes <= 0) throw new Error('Soru sayısını girin ve en az bir saniye çalışın.')
  return {
    p_session_id: session.id, p_question_plan_id: session.questionPlanId || null,
    p_user_id: session.ownerId, p_subject_id: session.subjectId,
    p_date: session.questionDate || localDayKey(new Date(session.startedAt)),
    p_questions: answers.solved_questions, p_correct: answers.correct_questions, p_wrong: answers.wrong_questions, p_note: note,
    p_started_at: session.startedAt, p_ended_at: session.endedAt, p_duration_minutes: session.durationMinutes,
  }
}
