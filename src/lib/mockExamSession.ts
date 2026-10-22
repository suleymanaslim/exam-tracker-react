import { localDayKey } from './statsPeriod.ts'

export type ExamMode = 'countdown' | 'stopwatch'
export interface ActiveMockExam {
  sessionId: string
  subjectId: string | null
  mode: ExamMode
  examId: string
  examName: string
  examColor: string
  title: string
  durationMinutes: number
  startedAt: number
  endsAt: number | null
  date: string
  finishedAt?: number
  recorded?: boolean
}

export const MOCK_EXAM_STORAGE_PREFIX = 'studytracker-active-mock-exam:'

export function readActiveMockExam(value: unknown): ActiveMockExam | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<ActiveMockExam>
  if (!item.examId || typeof item.examId !== 'string'
    || typeof item.examName !== 'string' || typeof item.title !== 'string'
    || typeof item.durationMinutes !== 'number' || !Number.isFinite(item.durationMinutes)
    || typeof item.startedAt !== 'number' || !Number.isFinite(item.startedAt)
    || typeof item.date !== 'string') return null
  const mode = item.mode === 'stopwatch' ? 'stopwatch' : 'countdown'
  if (mode === 'countdown' && (!Number.isInteger(item.durationMinutes) || item.durationMinutes < 1 || item.durationMinutes > 600)) return null
  const endsAt = mode === 'stopwatch' ? null : item.startedAt + item.durationMinutes * 60_000
  const finishedAt = typeof item.finishedAt === 'number' && Number.isFinite(item.finishedAt)
    ? Math.max(item.startedAt, Math.min(item.finishedAt, endsAt ?? item.finishedAt)) : undefined
  return {
    sessionId: typeof item.sessionId === 'string' && item.sessionId ? item.sessionId : crypto.randomUUID(),
    subjectId: typeof item.subjectId === 'string' ? item.subjectId : null,
    mode, examId: item.examId, examName: item.examName,
    examColor: typeof item.examColor === 'string' ? item.examColor : '#4269a8',
    title: item.title, durationMinutes: item.durationMinutes, startedAt: item.startedAt,
    endsAt, date: item.date || localDayKey(new Date(item.startedAt)),
    finishedAt, recorded: finishedAt !== undefined && item.recorded === true,
  }
}

export function mockExamTime(exam: ActiveMockExam, now: number) {
  const end = Math.min(exam.finishedAt ?? now, exam.endsAt ?? Infinity)
  return {
    elapsed: Math.max(0, Math.floor((end - exam.startedAt) / 1000)),
    remaining: exam.endsAt === null ? null : Math.max(0, Math.ceil((exam.endsAt - (exam.finishedAt ?? now)) / 1000)),
  }
}

export function formatMockDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  return [Math.floor(safe / 3600), Math.floor(safe / 60) % 60, safe % 60].map(value => String(value).padStart(2, '0')).join(':')
}

export function nextNumberedMockTitle(notes: (string | null)[]) {
  const highest = notes.reduce((highest, note) => {
    const title = note?.includes(' · ') ? note.slice(note.indexOf(' · ') + 3) : note
    const match = /^Deneme\s*-\s*(\d+)$/i.exec(title?.trim() || '')
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)
  return `Deneme - ${highest + 1}`
}

export function mockExamPayload(exam: ActiveMockExam, userId: string) {
  const endedAt = exam.finishedAt ?? exam.endsAt ?? exam.startedAt
  return {
    id: exam.sessionId, user_id: userId, subject_id: exam.subjectId, resource_id: null,
    session_type: 'mock_exam', started_at: new Date(exam.startedAt).toISOString(),
    ended_at: new Date(endedAt).toISOString(),
    duration_minutes: Math.round(Math.max(0, endedAt - exam.startedAt) / 60_000 * 1_000_000) / 1_000_000,
    note: `${exam.examName} · ${exam.title}`, is_edited: false,
  }
}
