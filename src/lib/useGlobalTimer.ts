/**
 * useGlobalTimer
 *
 * App.tsx seviyesinde mount edilir — sayfa değişse bile timer çalışmaya devam eder.
 * Deadline-based yaklaşım: Date.now() farkı ile hesaplama yapılır.
 * Phase desteği: focus → break → focus döngüsü.
 * Web Notification API: tab arka plandayken bildirim gönderir.
 */
import { useEffect, useRef, useCallback } from 'react'
import { useTimerStore } from './timerStore'
import { supabase } from './supabase'

const ALARM_URL = 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg'

function playAlarm() {
  const audio = new Audio(ALARM_URL)
  audio.play().catch(() => {})
}

function sendNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/favicon.jpg' })
    } catch (_e) { /* mobile fallback */ }
  }
}

export function useGlobalTimer() {
  const {
    isRunning,
    secondsLeft,
    totalSeconds,
    startedAt,
    mode,
    phase,
    selSubject,
    selResource,
    deadlineEpoch,
    breakSeconds,
    setIsRunning,
    setSecondsLeft,
    setTotalSeconds,
    setStartedAt,
    setDeadlineEpoch,
    setPhase,
  } = useTimerStore()


  // Focus süresi referansı — mola sonrası geri dönmek için
  const focusTotalRef = useRef(totalSeconds)
  useEffect(() => { if (phase === 'focus' && totalSeconds > 0) focusTotalRef.current = totalSeconds }, [phase, totalSeconds])

  // ── Bildirim izni iste ──────────────────────────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // ── Save session to DB ──────────────────────────────────────────────
  const saveSession = useCallback(async (durationMins: number, start: Date) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !selSubject) return
    const now = new Date()
    await supabase.from('study_sessions').insert({
      user_id: user.id,
      subject_id: selSubject || null,
      resource_id: selResource || null,
      session_type: mode,
      started_at: start.toISOString(),
      ended_at: now.toISOString(),
      duration_minutes: durationMins,
    })
  }, [selSubject, selResource, mode])

  // ── Handle timer reaching zero ──────────────────────────────────────
  const handleEnd = useCallback((total: number, start: Date | null) => {
    if (phase === 'focus') {
      // ── Focus bitti → oturumu kaydet → molaya geç ──────────────
      const durationMins = Math.round(total / 60)
      const startDate = start ?? new Date(Date.now() - durationMins * 60_000)

      setIsRunning(false)
      setDeadlineEpoch(null)
      setStartedAt(null)

      playAlarm()
      sendNotification('⏱ Süre Doldu!', `${durationMins} dk çalışma tamamlandı. Mola zamanı!`)
      document.title = '✅ Süre Doldu! — ExamTracker'

      if (durationMins > 0) {
        saveSession(durationMins, startDate)
      }

      // Mola moduna geç (manual modda mola yok)
      if (mode !== 'manual' && breakSeconds > 0) {
        setTimeout(() => {
          setPhase('break')
          setSecondsLeft(breakSeconds)
          setTotalSeconds(breakSeconds)
          setDeadlineEpoch(Date.now() + breakSeconds * 1000)
          setIsRunning(true)
          document.title = `☕ Mola Başladı — ExamTracker`
        }, 1500) // 1.5s gecikme — "Süre Doldu!" mesajı görünsün
      } else {
        // Manuel mod — sadece sıfırla
        setSecondsLeft(total)
      }
    } else {
      // ── Mola bitti → tekrar focus'a dön ────────────────────────
      setIsRunning(false)
      setDeadlineEpoch(null)
      setStartedAt(null)

      playAlarm()
      sendNotification('☕ Mola Bitti!', 'Çalışmaya devam etmeye hazır mısın?')
      document.title = '🟢 Mola Bitti! — ExamTracker'
      setTimeout(() => { document.title = 'ExamTracker' }, 5000)

      // Focus moduna dön
      setPhase('focus')
      const focusSecs = focusTotalRef.current > 0 ? focusTotalRef.current : 3000
      setSecondsLeft(focusSecs)
      setTotalSeconds(focusSecs)
    }
  }, [phase, mode, breakSeconds, setIsRunning, setSecondsLeft, setTotalSeconds, setDeadlineEpoch, setStartedAt, setPhase, saveSession])

  // ── Tick: deadline-based with Web Worker for background reliability ─
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    // Worker oluştur (sadece bir kez)
    if (!workerRef.current) {
      const workerCode = `
        let timer = null;
        self.onmessage = (e) => {
          if (e.data === 'start') {
            if (timer) clearInterval(timer);
            timer = setInterval(() => self.postMessage('tick'), 500);
          } else if (e.data === 'stop') {
            if (timer) clearInterval(timer);
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      workerRef.current = new Worker(URL.createObjectURL(blob));
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isRunning || deadlineEpoch === null) {
      workerRef.current?.postMessage('stop');
      return
    }

    const tick = () => {
      const remaining = Math.max(0, Math.round((deadlineEpoch - Date.now()) / 1000))
      setSecondsLeft(remaining)

      // Update tab title
      const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
      const ss = String(remaining % 60).padStart(2, '0')
      if (phase === 'break') {
        document.title = `☕ ${mm}:${ss} — Mola`
      } else {
        document.title = `⏱ ${mm}:${ss} — ExamTracker`
      }

      if (remaining <= 0) {
        workerRef.current?.postMessage('stop');
        handleEnd(totalSeconds, startedAt)
      }
    }

    // İlk tick manuel
    tick()

    // Worker ile tick tetikle
    if (workerRef.current) {
      workerRef.current.onmessage = () => {
        tick();
      };
      workerRef.current.postMessage('start');
    }

    return () => {
      workerRef.current?.postMessage('stop');
      if (workerRef.current) {
        workerRef.current.onmessage = null;
      }
    }
  }, [isRunning, deadlineEpoch]) // intentionally minimal deps

  // ── Restore title when not running ─────────────────────────────────
  useEffect(() => {
    if (!isRunning) {
      if (secondsLeft > 0 && secondsLeft < totalSeconds) {
        const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
        const ss = String(secondsLeft % 60).padStart(2, '0')
        if (phase === 'break') {
          document.title = `⏸ ${mm}:${ss} — Mola`
        } else {
          document.title = `⏸ ${mm}:${ss} — ExamTracker`
        }
      } else {
        document.title = 'ExamTracker'
      }
    }
  }, [isRunning, secondsLeft, totalSeconds, phase])

  // ── Page Visibility API: recover after tab comes back ──────────────
  useEffect(() => {
    const onVisible = () => {
      if (isRunning && deadlineEpoch !== null) {
        const remaining = Math.max(0, Math.round((deadlineEpoch - Date.now()) / 1000))
        setSecondsLeft(remaining)
        if (remaining <= 0) {
          handleEnd(totalSeconds, startedAt)
        }
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [isRunning, deadlineEpoch, totalSeconds, startedAt, handleEnd, setSecondsLeft])
}
