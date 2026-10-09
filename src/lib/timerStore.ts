import { create } from 'zustand'
import { readTimerSnapshot, recoveryFor, remainingSeconds, isCountUp } from './timerRecovery.ts'
import type { RecoverySession, TimerMode, TimerSnapshot } from './timerRecovery.ts'

interface TimerState {
  ownerId: string | null
  isRunning: boolean
  secondsLeft: number
  totalSeconds: number
  focusSeconds: number
  startedAt: Date | null
  sessionId: string | null
  mode: TimerMode
  phase: 'focus' | 'break'
  selExam: string
  selSubject: string
  selResource: string
  deadlineEpoch: number | null
  breakSeconds: number
  recovery: RecoverySession | null
  isFinishing: boolean
  questionPlanId: string | null
  questionDate: string | null
  setIsRunning: (v: boolean) => void
  setSecondsLeft: (v: number) => void
  setTotalSeconds: (v: number) => void
  setStartedAt: (v: Date | null) => void
  setMode: (v: TimerMode) => void
  setPhase: (v: 'focus' | 'break') => void
  setSelExam: (v: string) => void
  setSelSubject: (v: string) => void
  setSelResource: (v: string) => void
  setDeadlineEpoch: (v: number | null) => void
  setBreakSeconds: (v: number) => void
  resetTimer: (focusSeconds: number) => void
  startTimer: () => void
  startQuestions: (selection: { examId: string; subjectId: string; resourceId?: string | null; planId?: string | null; date: string }) => void
  pauseTimer: () => void
  queueRecovery: () => void
  resolveRecovery: (saved: boolean) => void
  finishFocus: () => void
  finishBreak: () => void
}

const initial = {
  ownerId: null as string | null, isRunning: false, secondsLeft: 0, totalSeconds: 0,
  focusSeconds: 3000, startedAt: null as Date | null, sessionId: null as string | null,
  mode: 'pomodoro_long' as TimerMode, phase: 'focus' as 'focus' | 'break',
  selExam: '', selSubject: '', selResource: '', deadlineEpoch: null as number | null,
  isFinishing: false, questionPlanId: null as string | null, questionDate: null as string | null,
  breakSeconds: 600, recovery: null as RecoverySession | null,
}

export const useTimerStore = create<TimerState>((set, get) => ({
  ...initial,
  setIsRunning: value => set({ isRunning: value }),
  setSecondsLeft: value => set({ secondsLeft: value }),
  setTotalSeconds: value => set({ totalSeconds: value, ...(get().phase === 'focus' && !get().startedAt ? { focusSeconds: value } : {}) }),
  setStartedAt: value => set({ startedAt: value, sessionId: value ? get().sessionId || crypto.randomUUID() : null }),
  setMode: value => set({ mode: value, questionPlanId: null, questionDate: null }), setPhase: value => set({ phase: value }),
  setSelExam: value => set({ selExam: value }), setSelSubject: value => set({ selSubject: value }),
  setSelResource: value => set({ selResource: value }), setDeadlineEpoch: value => set({ deadlineEpoch: value }),
  setBreakSeconds: value => set({ breakSeconds: value }),
  resetTimer: focusSeconds => set({ isRunning: false, secondsLeft: focusSeconds, totalSeconds: focusSeconds,
    focusSeconds, startedAt: null, sessionId: null, deadlineEpoch: null, phase: 'focus', recovery: null, isFinishing: false, questionPlanId: null, questionDate: null }),
  startTimer: () => {
    const state = get()
    if (!state.ownerId || !state.selSubject || state.recovery || (!isCountUp(state.mode) && state.secondsLeft <= 0)) return
    set({ isRunning: true, deadlineEpoch: isCountUp(state.mode) ? Date.now() - state.secondsLeft * 1000 : Date.now() + state.secondsLeft * 1000,
      ...(state.phase === 'focus' && !state.startedAt ? { startedAt: new Date(), sessionId: crypto.randomUUID() } : {}) })
  },
  startQuestions: selection => {
    const state = get()
    if (!state.ownerId || state.isRunning || state.startedAt || state.recovery || state.phase === 'break') return
    get().resetTimer(0)
    set({ mode: 'questions', selExam: selection.examId, selSubject: selection.subjectId,
      selResource: selection.resourceId || '', questionPlanId: selection.planId || null, questionDate: selection.date })
    get().startTimer()
  },
  pauseTimer: () => {
    const state = get()
    set({ secondsLeft: remainingSeconds(state, Date.now()), isRunning: false, deadlineEpoch: null })
  },
  queueRecovery: () => {
    const state = get()
    const recovery = recoveryFor(snapshot(state), Date.now())
    if (recovery) set({ recovery: { ...recovery, reason: 'save-failed' }, isRunning: false, deadlineEpoch: null, secondsLeft: recovery.remainingSeconds })
  },
  resolveRecovery: saved => {
    const state = get(), recovery = state.recovery
    if (!recovery) return
    if (!saved) { get().resetTimer(state.focusSeconds); return }
    if (isCountUp(state.mode)) { get().resetTimer(0); return }
    if (recovery.remainingSeconds <= 0) { get().finishFocus(); return }
    // The confirmed portion has its own ID. Continue only the unrecorded remainder.
    const unrecordedTotal = state.totalSeconds - recovery.durationMinutes * 60
    const carriedSeconds = Math.max(0, unrecordedTotal - recovery.remainingSeconds)
    set({ recovery: null, totalSeconds: unrecordedTotal, secondsLeft: recovery.remainingSeconds,
      startedAt: new Date(Date.now() - carriedSeconds * 1000), sessionId: recovery.durationMinutes > 0 ? crypto.randomUUID() : state.sessionId, isRunning: recovery.resume,
      deadlineEpoch: recovery.resume ? Date.now() + recovery.remainingSeconds * 1000 : null })
  },
  finishFocus: () => {
    const state = get()
    if (state.mode !== 'manual' && !isCountUp(state.mode) && state.breakSeconds > 0) {
      set({ recovery: null, startedAt: null, sessionId: null, phase: 'break', secondsLeft: state.breakSeconds,
        totalSeconds: state.breakSeconds, isRunning: true, deadlineEpoch: Date.now() + state.breakSeconds * 1000 })
    } else get().resetTimer(state.focusSeconds)
  },
  finishBreak: () => get().resetTimer(get().focusSeconds),
}))

function snapshot(state: TimerState): TimerSnapshot {
  return {
    ownerId: state.ownerId || '', isRunning: state.isRunning, secondsLeft: state.secondsLeft,
    totalSeconds: state.totalSeconds, focusSeconds: state.focusSeconds, startedAt: state.startedAt?.toISOString() || null,
    sessionId: state.sessionId, mode: state.mode, phase: state.phase, selExam: state.selExam,
    selSubject: state.selSubject, selResource: state.selResource, deadlineEpoch: state.deadlineEpoch,
    breakSeconds: state.breakSeconds, recovery: state.recovery, questionPlanId: state.questionPlanId, questionDate: state.questionDate,
  }
}

const storageKey = (ownerId: string) => `examtracker-timer-v1:${ownerId}`
export function bindTimerOwner(ownerId: string | null) {
  if (useTimerStore.getState().ownerId === ownerId) return
  let restored: TimerSnapshot | null = null
  if (ownerId) {
    try { restored = readTimerSnapshot(localStorage.getItem(storageKey(ownerId)), ownerId) } catch { /* storage unavailable */ }
  }
  if (!restored) { useTimerStore.setState({ ...initial, ownerId }); return }
  const remaining = remainingSeconds(restored, Date.now())
  const recovery = restored.recovery || (restored.phase === 'focus' && (restored.isRunning || (restored.startedAt && remaining <= 0)) ? recoveryFor(restored, Date.now()) : null)
  const expiredBreak = restored.phase === 'break' && remaining <= 0
  useTimerStore.setState({ ...restored, isFinishing: false, questionPlanId: restored.questionPlanId || null, questionDate: restored.questionDate || null, ownerId, startedAt: restored.startedAt ? new Date(restored.startedAt) : null,
    recovery, isRunning: recovery || expiredBreak ? false : restored.isRunning,
    deadlineEpoch: recovery || expiredBreak ? null : restored.deadlineEpoch,
    secondsLeft: expiredBreak ? restored.focusSeconds : remaining,
    totalSeconds: expiredBreak ? restored.focusSeconds : restored.totalSeconds,
    phase: expiredBreak ? 'focus' : restored.phase,
  })
}

useTimerStore.subscribe(state => {
  if (!state.ownerId) return
  try { localStorage.setItem(storageKey(state.ownerId), JSON.stringify(snapshot(state))) } catch { /* timer remains usable in memory */ }
})
