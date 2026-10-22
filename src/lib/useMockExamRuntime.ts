import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { bindMockExamOwner, persistMockExam, useMockExamStore } from './mockExamStore'
import { MOCK_EXAM_STORAGE_PREFIX, mockExamPayload } from './mockExamSession'

export async function finishMockExam(ownerId: string, requestedEndAt = Date.now()) {
  const state = useMockExamStore.getState()
  if (state.ownerId !== ownerId || !state.active || state.saving) return
  const exam = state.active
  if (exam.recorded) return
  const finished = { ...exam, finishedAt: exam.finishedAt ?? Math.max(exam.startedAt, Math.min(requestedEndAt, exam.endsAt ?? requestedEndAt)) }
  useMockExamStore.setState({ saving: true, error: '' })
  try {
    // Freeze the duration before sending it, including early finishes and failed retries.
    persistMockExam(ownerId, finished)
    const payload = mockExamPayload(finished, ownerId)
    if (payload.duration_minutes > 0) {
      const { error } = await supabase.from('study_sessions').upsert(payload, { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw error
      window.dispatchEvent(new Event('study-session-saved'))
    }
    const current = useMockExamStore.getState()
    if (current.ownerId === ownerId && current.active?.sessionId === exam.sessionId) persistMockExam(ownerId, { ...finished, recorded: true })
  } catch {
    if (useMockExamStore.getState().ownerId === ownerId) useMockExamStore.setState({ error: 'Süre kaydedilemedi. Bağlantını kontrol edip yeniden dene; denemen korunuyor.' })
  } finally {
    if (useMockExamStore.getState().ownerId === ownerId) useMockExamStore.setState({ saving: false })
  }
}

export function useMockExamRuntime(ownerId: string | null) {
  const { active } = useMockExamStore()
  const navigate = useNavigate()
  const location = useLocation()
  const handedOff = useRef<string | null>(null)
  useEffect(() => { handedOff.current = null; bindMockExamOwner(ownerId) }, [ownerId])

  useEffect(() => {
    if (!ownerId) return
    const tick = () => {
      const state = useMockExamStore.getState()
      if (state.ownerId !== ownerId || !state.active) return
      const now = Date.now()
      useMockExamStore.setState({ now })
      if (!state.active.recorded && !state.saving && !state.error
        && (state.active.finishedAt !== undefined || (state.active.endsAt !== null && now >= state.active.endsAt))) {
        void finishMockExam(ownerId, state.active.endsAt ?? now)
      }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === MOCK_EXAM_STORAGE_PREFIX + ownerId || event.key === null) bindMockExamOwner(ownerId)
      tick()
    }
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    const interval = window.setInterval(tick, 1000)
    window.addEventListener('storage', onStorage)
    window.addEventListener('pageshow', tick)
    document.addEventListener('visibilitychange', onVisible)
    tick()
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pageshow', tick)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ownerId])

  useEffect(() => {
    const state = useMockExamStore.getState()
    const completed = state.active
    if (state.ownerId !== ownerId || !completed?.recorded) return
    if (handedOff.current === completed.sessionId && location.pathname !== '/timed-mock-exam') return
    handedOff.current = completed.sessionId
    if (location.pathname === '/results') return
    const params = new URLSearchParams({ mockExam: '1', examId: completed.examId, title: completed.title, date: completed.date })
    navigate(`/results?${params}`, { replace: true })
  }, [ownerId, active, location.pathname, navigate])
}
