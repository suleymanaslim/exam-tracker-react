import { create } from 'zustand'
import { readTimerSnapshot, recoveryFor, remainingSeconds } from './timerRecovery.ts'
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
  breakSeconds: 600, recovery: null as RecoverySession | null,
}

export const useTimerStore = create<TimerState>((set, get) => ({
  ...initial,
  setIsRunning: value => set({ isRunning: value }),
  setSecondsLeft: value => set({ secondsLeft: value }),
  setTotalSeconds: value => set({ totalSeconds: value, ...(get().phase === 'focus' && !get().startedAt ? { focusSeconds: value } : {}) }),
  setStartedAt: value => set({ startedAt: value, sessionId: value ? get().sessionId || crypto.randomUUID() : null }),
  setMode: value => set({ mode: value }), setPhase: value => set({ phase: value }),
  setSelExam: value => set({ selExam: value }), setSelSubject: value => set({ selSubject: value }),
  setSelResource: value => set({ selResource: value }), setDeadlineEpoch: value => set({ deadlineEpoch: value }),
  setBreakSeconds: value => set({ breakSeconds: value }),
  resetTimer: focusSeconds => set({ isRunning: false, secondsLeft: focusSeconds, totalSeconds: focusSeconds,
    focusSeconds, startedAt: null, sessionId: null, deadlineEpoch: null, phase: 'focus', recovery: null }),
  startTimer: () => {
    const state = get()
    if (!state.ownerId || !state.selSubject || state.recovery || (state.mode !== 'stopwatch' && state.secondsLeft <= 0)) return
    set({ isRunning: true, deadlineEpoch: state.mode === 'stopwatch' ? Date.now() - state.secondsLeft * 1000 : Date.now() + state.secondsLeft * 1000,
      ...(state.phase === 'focus' && !state.startedAt ? { startedAt: new Date(), sessionId: crypto.randomUUID() } : {}) })
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
    if (state.mode === 'stopwatch') { get().resetTimer(0); return }
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
    if (state.mode !== 'manual' && state.mode !== 'stopwatch' && state.breakSeconds > 0) {
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
    breakSeconds: state.breakSeconds, recovery: state.recovery,
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
  useTimerStore.setState({ ...restored, ownerId, startedAt: restored.startedAt ? new Date(restored.startedAt) : null,
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
