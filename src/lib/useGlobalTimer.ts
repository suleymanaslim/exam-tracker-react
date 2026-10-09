import { useEffect, useRef } from 'react'
import { bindTimerOwner, useTimerStore } from './timerStore'
import { recoveryFor, remainingSeconds, sessionPayload, isCountUp, recordedMinutes, canContinueRecovery } from './timerRecovery'
import type { RecoverySession } from './timerRecovery'
import { supabase } from './supabase'
import { persistQuestionSession } from './questionSession'
import { timerSaveError, timerSaveWasRejected } from './timerSaveError'
import { sessionCompletionDialog } from './sessionCompletionDialog'
import { questionCompletionOptions, readQuestionAnswers, lockQuestionInputs } from './questionDialogs'
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
  if (session.mode === 'questions') {
    await persistQuestionSession(session, payload => supabase.rpc('save_question_study_session', payload))
    window.dispatchEvent(new Event('study-session-saved'))
    return true
  }
  if (session.durationMinutes <= 0 || (session.mode !== 'stopwatch' && session.durationMinutes < 1)) return true
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
    if (!ownerId || state.ownerId !== ownerId || !state.recovery || state.isFinishing || promptingRef.current) return
    const recovery = state.recovery
    const durationLabel = `${recordedMinutes(recovery.durationMinutes)} dakika`
    const questionOptions = recovery.mode === 'questions'
      ? questionCompletionOptions(recovery.solvedQuestions == null ? '' : String(recovery.solvedQuestions), recovery.correctQuestions, recovery.wrongQuestions, recovery.solvedQuestions != null, recovery.questionTarget, { note: recovery.questionNote, ownerId: recovery.ownerId, subjectId: recovery.subjectId })
      : null
    const message = recovery.reason === 'save-failed' ? `${durationLabel} çalışma korunuyor. Kaydetmeyi tekrar deneyebilirsin.` : recovery.durationMinutes > 0
      ? `Önceki oturumdan ${durationLabel} geçti. Çalıştıysanız bu süreyi kaydedebiliriz.`
      : 'Önceki oturumda bir dakikadan az süre geçti. Çalışmaya devam etmek ister misiniz?'
    promptingRef.current = true
    void (async () => {
      let saveUncertain = recovery.reason === 'save-failed' && recovery.saveRejected !== true
      const result = await Swal.fire(sessionCompletionDialog({
        ...(questionOptions ? { ...questionOptions, html: `<p>${message}</p>${questionOptions.html}` } : {}),
        title: recovery.reason === 'save-failed' ? 'Oturum kaydedilemedi' : 'Bu süre içinde çalıştınız mı?',
        text: message,
        width: recovery.mode === 'questions' ? 420 : 380,
        showLoaderOnConfirm: true,
        preConfirm: async value => {
          if (useTimerStore.getState().ownerId !== recovery.ownerId || useTimerStore.getState().recovery?.id !== recovery.id) return false
          let session = recovery
          if (recovery.mode === 'questions') {
            const pending = useTimerStore.getState().recovery
            const answers = pending?.solvedQuestions != null ? { solved_questions: pending.solvedQuestions, correct_questions: pending.correctQuestions ?? null, wrong_questions: pending.wrongQuestions ?? null, note: pending.questionNote ?? null } : readQuestionAnswers(value)
            if (!answers) return false
            session = { ...recovery, solvedQuestions: answers.solved_questions, correctQuestions: answers.correct_questions, wrongQuestions: answers.wrong_questions, questionNote: answers.note }
            lockQuestionInputs()
          }
          useTimerStore.setState({ recovery: { ...session, reason: 'save-failed', saveRejected: false } })
          try { await saveTimerSession(session); return true }
          catch (error) {
            console.error('Recovered timer save failed:', error)
            saveUncertain ||= !timerSaveWasRejected(error)
            if (useTimerStore.getState().ownerId === recovery.ownerId && useTimerStore.getState().recovery?.id === recovery.id) {
              useTimerStore.setState({ recovery: { ...session, reason: 'save-failed', saveRejected: !saveUncertain } })
            }
            Swal.showValidationMessage(timerSaveError(error, recovery.mode === 'questions'))
            return false
          }
        },
      }, () => canContinueRecovery(useTimerStore.getState().recovery)))
      if (useTimerStore.getState().ownerId === recovery.ownerId && useTimerStore.getState().recovery?.id === recovery.id) {
        const current = useTimerStore.getState()
        if (result.isConfirmed) current.resetTimer(isCountUp(recovery.mode) ? 0 : current.focusSeconds)
        else if (result.isDenied) current.resolveRecovery(false)
        else if (result.dismiss === Swal.DismissReason.cancel) current.continueRecovery()
      }
      promptingRef.current = false
    })()
  }, [ownerId, state.ownerId, state.recovery, state.isFinishing])

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
      document.title = `${current.phase === 'break' ? 'Mola' : current.mode === 'questions' ? 'Soru çözümü' : current.mode === 'stopwatch' ? 'Kronometre' : 'Odak'} ${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')} — ExamTracker`
      if (isCountUp(current.mode) || remaining > 0) return
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
