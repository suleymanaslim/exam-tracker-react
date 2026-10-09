export type TimerMode = 'pomodoro_long' | 'pomodoro_short' | 'manual' | 'stopwatch' | 'questions'
export interface TimerSnapshot {
  ownerId: string
  isRunning: boolean
  secondsLeft: number
  totalSeconds: number
  focusSeconds: number
  startedAt: string | null
  sessionId: string | null
  mode: TimerMode
  phase: 'focus' | 'break'
  selExam: string
  selSubject: string
  selResource: string
  deadlineEpoch: number | null
  breakSeconds: number
  recovery: RecoverySession | null
  questionPlanId?: string | null
  questionDate?: string | null
}
export interface RecoverySession {
  id: string
  ownerId: string
  subjectId: string
  resourceId: string
  mode: TimerMode
  startedAt: string
  endedAt: string
  durationMinutes: number
  remainingSeconds: number
  resume: boolean
  reason?: 'reopened' | 'save-failed'
  questionPlanId?: string | null
  questionDate?: string | null
  solvedQuestions?: number
  correctQuestions?: number | null
  wrongQuestions?: number | null
}

export function remainingSeconds(snapshot: Pick<TimerSnapshot, 'isRunning' | 'deadlineEpoch' | 'secondsLeft'> & { mode?: TimerMode }, now: number) {
  if (isCountUp(snapshot.mode)) return snapshot.isRunning && snapshot.deadlineEpoch !== null
    ? Math.max(0, Math.floor((now - snapshot.deadlineEpoch) / 1000)) : snapshot.secondsLeft
  return snapshot.isRunning && snapshot.deadlineEpoch !== null
    ? Math.max(0, Math.ceil((snapshot.deadlineEpoch - now) / 1000))
    : snapshot.secondsLeft
}

export function recoveryFor(snapshot: TimerSnapshot, now: number): RecoverySession | null {
  if (snapshot.recovery) return snapshot.recovery
  if (snapshot.phase !== 'focus' || !snapshot.startedAt || !snapshot.sessionId || !snapshot.selSubject) return null
  const stopwatch = isCountUp(snapshot.mode)
  const remaining = stopwatch ? remainingSeconds(snapshot, now) : Math.min(snapshot.totalSeconds, remainingSeconds(snapshot, now))
  const elapsed = stopwatch ? remaining : Math.max(0, snapshot.totalSeconds - remaining)
  return {
    id: snapshot.sessionId, ownerId: snapshot.ownerId, subjectId: snapshot.selSubject,
    resourceId: snapshot.selResource, mode: snapshot.mode, startedAt: snapshot.startedAt,
    questionPlanId: snapshot.questionPlanId || null, questionDate: snapshot.questionDate || null,
    endedAt: new Date(stopwatch ? Date.parse(snapshot.startedAt) + elapsed * 1000 : Math.min(now, snapshot.deadlineEpoch ?? now)).toISOString(),
    durationMinutes: stopwatch ? elapsed / 60 : Math.floor(elapsed / 60), remainingSeconds: remaining, resume: snapshot.isRunning, reason: 'reopened',
  }
}

export function readTimerSnapshot(raw: string | null, ownerId: string): TimerSnapshot | null {
  try {
    const value = JSON.parse(raw || 'null') as TimerSnapshot | null
    if (!value || value.ownerId !== ownerId || !['focus', 'break'].includes(value.phase) || !['pomodoro_long', 'pomodoro_short', 'manual', 'stopwatch', 'questions'].includes(value.mode)) return null
    for (const key of ['secondsLeft', 'totalSeconds', 'focusSeconds', 'breakSeconds'] as const) {
      if (!Number.isFinite(value[key]) || value[key] < 0 || (key !== 'secondsLeft' || !isCountUp(value.mode)) && value[key] > 86400) return null
    }
    if (typeof value.isRunning !== 'boolean' || (value.deadlineEpoch !== null && !Number.isFinite(value.deadlineEpoch))) return null
    if (value.startedAt !== null && !Number.isFinite(Date.parse(value.startedAt))) return null
    if (value.sessionId !== null && !/^[0-9a-f-]{36}$/i.test(value.sessionId)) return null
    for (const key of ['selExam', 'selSubject', 'selResource'] as const) if (typeof value[key] !== 'string') return null
    if (value.recovery && (value.recovery.ownerId !== ownerId || value.recovery.id !== value.sessionId || !Number.isFinite(value.recovery.durationMinutes) || value.recovery.durationMinutes < 0 || !Number.isFinite(value.recovery.remainingSeconds) || value.recovery.remainingSeconds < 0)) return null
    if (value.questionPlanId != null && !/^[0-9a-f-]{36}$/i.test(value.questionPlanId)) return null
    if (value.questionDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(value.questionDate)) return null
    if (value.recovery?.solvedQuestions != null && (!Number.isInteger(value.recovery.solvedQuestions) || value.recovery.solvedQuestions < 0 || value.recovery.solvedQuestions > 100000)) return null
    if (value.recovery) {
      for (const key of ['correctQuestions', 'wrongQuestions'] as const) {
        const count = value.recovery[key]
        if (count != null && (!Number.isInteger(count) || count < 0 || count > 100000)) return null
      }
      if (value.recovery.solvedQuestions != null && (value.recovery.correctQuestions || 0) + (value.recovery.wrongQuestions || 0) > value.recovery.solvedQuestions) return null
    }
    return value
  } catch { return null }
}

export function sessionPayload(session: RecoverySession) {
  return {
    id: session.id, user_id: session.ownerId, subject_id: session.subjectId,
    resource_id: session.resourceId || null, session_type: isCountUp(session.mode) ? 'manual' : session.mode,
    started_at: session.startedAt, ended_at: session.endedAt,
    duration_minutes: session.durationMinutes,
  }
}

export function isCountUp(mode?: TimerMode) { return mode === 'stopwatch' || mode === 'questions' }
