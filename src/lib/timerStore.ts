import { create } from 'zustand'

interface TimerState {
  isRunning: boolean
  secondsLeft: number
  totalSeconds: number
  startedAt: Date | null
  mode: 'pomodoro_long' | 'pomodoro_short' | 'manual'
  phase: 'focus' | 'break'
  selExam: string
  selSubject: string
  selResource: string
  deadlineEpoch: number | null
  breakSeconds: number

  setIsRunning: (v: boolean) => void
  setSecondsLeft: (v: number) => void
  setTotalSeconds: (v: number) => void
  setStartedAt: (v: Date | null) => void
  setMode: (v: TimerState['mode']) => void
  setPhase: (v: 'focus' | 'break') => void
  setSelExam: (v: string) => void
  setSelSubject: (v: string) => void
  setSelResource: (v: string) => void
  setDeadlineEpoch: (v: number | null) => void
  setBreakSeconds: (v: number) => void
  resetTimer: (focusSeconds: number) => void
}

export const useTimerStore = create<TimerState>((set) => ({
  isRunning: false,
  secondsLeft: 0,
  totalSeconds: 0,
  startedAt: null,
  mode: 'pomodoro_long',
  phase: 'focus',
  selExam: '',
  selSubject: '',
  selResource: '',
  deadlineEpoch: null,
  breakSeconds: 600, // 10 dk default

  setIsRunning: (v) => set({ isRunning: v }),
  setSecondsLeft: (v) => set({ secondsLeft: v }),
  setTotalSeconds: (v) => set({ totalSeconds: v }),
  setStartedAt: (v) => set({ startedAt: v }),
  setMode: (v) => set({ mode: v }),
  setPhase: (v) => set({ phase: v }),
  setSelExam: (v) => set({ selExam: v }),
  setSelSubject: (v) => set({ selSubject: v }),
  setSelResource: (v) => set({ selResource: v }),
  setDeadlineEpoch: (v) => set({ deadlineEpoch: v }),
  setBreakSeconds: (v) => set({ breakSeconds: v }),
  resetTimer: (focusSeconds) => set({
    isRunning: false,
    secondsLeft: focusSeconds,
    totalSeconds: focusSeconds,
    startedAt: null,
    deadlineEpoch: null,
    phase: 'focus',
  }),
}))
