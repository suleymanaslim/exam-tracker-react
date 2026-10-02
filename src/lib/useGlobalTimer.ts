import { useEffect, useRef } from 'react'
import { bindTimerOwner, useTimerStore } from './timerStore'
import { recoveryFor, remainingSeconds, sessionPayload } from './timerRecovery'
import type { RecoverySession } from './timerRecovery'
import { supabase } from './supabase'
import { useAdminStore } from './adminStore'
import Swal from 'sweetalert2'
import { playTimerAlarm, stopTimerAlarm } from './timerAudio'

function alarm(title: string, body: string) {
  playTimerAlarm()
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, icon: '/studytracker-favicon.png' }) } catch { /* browser restrictions */ }
  }
}

export async function saveTimerSession(session: RecoverySession) {
  if (session.durationMinutes < 1) return true
  // The stable UUID prevents a retry/reload from inserting the same portion twice.
  const { error } = await supabase.from('study_sessions').upsert(sessionPayload(session), { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw error
  window.dispatchEvent(new Event('study-session-saved'))
  return true
}

export function useGlobalTimer(authenticatedUserId: string | null) {
  const { impersonatedUserId } = useAdminStore()
  const ownerId = authenticatedUserId ? impersonatedUserId || authenticatedUserId : null
  const state = useTimerStore()
  const savingRef = useRef(false)
  const promptingRef = useRef(false)

  useEffect(() => {
    if (promptingRef.current) { Swal.close(); promptingRef.current = false }
    stopTimerAlarm()
    bindTimerOwner(ownerId)
  }, [ownerId])

  useEffect(() => {
    if (!ownerId || state.ownerId !== ownerId || !state.recovery || promptingRef.current) return
    const recovery = state.recovery
    promptingRef.current = true
    void (async () => {
      const result = await Swal.fire({
        title: recovery.reason === 'save-failed' ? 'Oturum kaydedilemedi' : 'Bu süre içinde çalıştınız mı?',
        text: recovery.reason === 'save-failed' ? `${recovery.durationMinutes} dakikalık çalışma korunuyor. Kaydetmeyi tekrar deneyebilirsin.` : recovery.durationMinutes > 0
          ? `Önceki oturumdan ${recovery.durationMinutes} dakika geçti. Çalıştıysanız bu süreyi kaydedebiliriz.`
          : 'Önceki oturumda bir dakikadan az süre geçti. Çalışmaya devam etmek ister misiniz?',
        icon: 'question', showDenyButton: recovery.reason !== 'save-failed', showCancelButton: true,
        confirmButtonText: recovery.reason === 'save-failed' ? 'Tekrar kaydet' : recovery.durationMinutes > 0 ? 'Evet, kaydet' : 'Evet, devam et',
        denyButtonText: 'Hayır, kaydetme', cancelButtonText: 'Sonra karar ver',
        confirmButtonColor: '#4269a8', allowOutsideClick: false,
        showLoaderOnConfirm: true,
        preConfirm: async () => {
          if (useTimerStore.getState().ownerId !== recovery.ownerId) return false
          try { await saveTimerSession(recovery); return true }
          catch (error) {
            console.error('Recovered timer save failed:', error)
            Swal.showValidationMessage('Kaydedilemedi. Süren korunuyor; tekrar deneyebilirsin.')
            return false
          }
        },
      })
      if (useTimerStore.getState().ownerId === recovery.ownerId && useTimerStore.getState().recovery?.id === recovery.id) {
        if (result.isConfirmed) useTimerStore.getState().resolveRecovery(true)
        else if (result.isDenied) useTimerStore.getState().resolveRecovery(false)
      }
      promptingRef.current = false
    })()
  }, [ownerId, state.ownerId, state.recovery])

  // Run independently of the current route. Reopening the page is handled by hydration above.
  useEffect(() => {
    if (!ownerId || state.ownerId !== ownerId) return
    let worker: Worker | null = null
    let interval: ReturnType<typeof setInterval> | null = null
    let workerURL: string | null = null
    const tick = () => {
      const current = useTimerStore.getState()
      if (current.ownerId !== ownerId || !current.isRunning || current.deadlineEpoch === null || current.recovery || savingRef.current) return
      const remaining = remainingSeconds(current, Date.now())
      current.setSecondsLeft(remaining)
      document.title = `${current.phase === 'break' ? 'Mola' : 'Odak'} ${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')} — ExamTracker`
      if (remaining > 0) return
      if (current.phase === 'break') {
        current.finishBreak()
        alarm('Mola bitti', 'Yeni bir odak oturumuna hazırsın.')
        return
      }
      const session = recoveryFor({ ...current, ownerId, startedAt: current.startedAt?.toISOString() || null }, Date.now())
      if (!session) { current.resetTimer(current.focusSeconds); return }
      savingRef.current = true
      // Keep the completed session intact until the database confirms the insert.
      current.pauseTimer()
      void saveTimerSession(session).then(() => {
        if (useTimerStore.getState().ownerId === ownerId && useTimerStore.getState().sessionId === session.id) {
          useTimerStore.getState().finishFocus()
          alarm('Süre doldu', `${session.durationMinutes} dakika çalışma tamamlandı.`)
        }
      }).catch(error => {
        console.error('Timer save failed:', error)
        if (useTimerStore.getState().ownerId === ownerId) {
          useTimerStore.getState().queueRecovery()
        }
      }).finally(() => { savingRef.current = false })
    }
    try {
      workerURL = URL.createObjectURL(new Blob(['setInterval(() => self.postMessage("tick"), 500)'], { type: 'application/javascript' }))
      worker = new Worker(workerURL)
      worker.onmessage = tick
    } catch { interval = setInterval(tick, 1000) }
    tick()
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      worker?.terminate()
      if (workerURL) URL.revokeObjectURL(workerURL)
      if (interval) clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ownerId, state.ownerId])

  useEffect(() => {
    if (!state.isRunning) document.title = state.recovery ? 'Oturum onayı — ExamTracker' : 'ExamTracker'
  }, [state.isRunning, state.recovery])
}
