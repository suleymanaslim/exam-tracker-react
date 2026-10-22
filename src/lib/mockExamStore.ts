import { create } from 'zustand'
import { MOCK_EXAM_STORAGE_PREFIX, readActiveMockExam } from './mockExamSession.ts'
import type { ActiveMockExam } from './mockExamSession.ts'

interface MockExamState {
  ownerId: string | null
  active: ActiveMockExam | null
  now: number
  saving: boolean
  error: string
}
export const useMockExamStore = create<MockExamState>(() => ({ ownerId: null, active: null, now: Date.now(), saving: false, error: '' }))

export function bindMockExamOwner(ownerId: string | null) {
  let active = null
  if (ownerId) {
    try {
      const raw = localStorage.getItem(MOCK_EXAM_STORAGE_PREFIX + ownerId)
      active = raw ? readActiveMockExam(JSON.parse(raw)) : null
      // Upgrade legacy timers with a stable ID before any retry can save them.
      if (active) localStorage.setItem(MOCK_EXAM_STORAGE_PREFIX + ownerId, JSON.stringify(active))
    } catch { /* Storage may be unavailable; starting a new timer still requires a successful write. */ }
  }
  useMockExamStore.setState({ ownerId, active, now: Date.now(), saving: false, error: '' })
}

export function persistMockExam(ownerId: string, active: ActiveMockExam | null) {
  if (useMockExamStore.getState().ownerId !== ownerId) throw new Error('Hesap değişti. Lütfen tekrar dene.')
  if (active) localStorage.setItem(MOCK_EXAM_STORAGE_PREFIX + ownerId, JSON.stringify(active))
  else localStorage.removeItem(MOCK_EXAM_STORAGE_PREFIX + ownerId)
  useMockExamStore.setState({ active, now: Date.now(), error: '' })
}

export function clearMockExamResult(ownerId: string, sessionId: string) {
  const state = useMockExamStore.getState()
  if (state.ownerId === ownerId && state.active?.sessionId === sessionId) persistMockExam(ownerId, null)
}
