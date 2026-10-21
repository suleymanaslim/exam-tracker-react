import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, AlarmClock, AlertTriangle, CheckCircle2, Clock3, Play, RotateCcw } from 'lucide-react'
import Swal from 'sweetalert2'
import { supabase } from '../lib/supabase'
import { useAdminStore } from '../lib/adminStore'
import { localDayKey } from '../lib/statsPeriod'

interface MockExamOption {
  id: string
  name: string
  color?: string | null
}

interface MockExamSubject {
  id: string
  exam_id: string
  name: string
}

type ExamMode = 'countdown' | 'stopwatch'

interface ActiveMockExam {
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
}

const STORAGE_PREFIX = 'studytracker-active-mock-exam:'

function readActiveMockExam(value: unknown): ActiveMockExam | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<ActiveMockExam>
  if (typeof item.examId !== 'string'
    || typeof item.examName !== 'string'
    || typeof item.title !== 'string'
    || typeof item.durationMinutes !== 'number'
    || !Number.isFinite(item.durationMinutes)
    || typeof item.startedAt !== 'number'
    || !Number.isFinite(item.startedAt)
    || (item.endsAt !== null && typeof item.endsAt !== 'number')
    || typeof item.date !== 'string') return null

  // Older saved sessions predate the stopwatch option and session log ID.
  const mode: ExamMode = item.mode === 'stopwatch' ? 'stopwatch' : 'countdown'
  return {
    sessionId: typeof item.sessionId === 'string' && item.sessionId ? item.sessionId : crypto.randomUUID(),
    subjectId: typeof item.subjectId === 'string' ? item.subjectId : null,
    mode,
    examId: item.examId,
    examName: item.examName,
    examColor: typeof item.examColor === 'string' ? item.examColor : '#4269a8',
    title: item.title,
    durationMinutes: item.durationMinutes,
    startedAt: item.startedAt,
    endsAt: mode === 'stopwatch'
      ? null
      : typeof item.endsAt === 'number' && Number.isFinite(item.endsAt)
        ? item.endsAt
        : item.startedAt + Math.max(1, item.durationMinutes) * 60_000,
    date: item.date || localDayKey(new Date(item.startedAt)),
  }
}

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
}

export default function TimedMockExam() {
  const navigate = useNavigate()
  const { impersonatedUserId } = useAdminStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [exams, setExams] = useState<MockExamOption[]>([])
  const [subjects, setSubjects] = useState<MockExamSubject[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [recordingError, setRecordingError] = useState('')
  const [selectedExamId, setSelectedExamId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<ExamMode>('countdown')
  const [durationMinutes, setDurationMinutes] = useState('120')
  const [activeExam, setActiveExam] = useState<ActiveMockExam | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [saving, setSaving] = useState(false)
  const routedToResults = useRef(false)
  const savingRef = useRef(false)
  const pendingEndAt = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError('')
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        if (!cancelled) {
          setLoadError('Oturum bilgisi alınamadı. Lütfen tekrar giriş yap.')
          setLoading(false)
        }
        return
      }

      const targetUserId = impersonatedUserId || auth.user.id
      const [examResult, subjectResult] = await Promise.all([
        supabase.from('exams').select('id, name, color').eq('user_id', targetUserId).order('name'),
        supabase.from('subjects').select('id, exam_id, name').eq('user_id', targetUserId).order('name'),
      ])
      if (cancelled) return

      setUserId(targetUserId)
      const availableExams = (examResult.data || []) as MockExamOption[]
      const availableSubjects = (subjectResult.data || []) as MockExamSubject[]
      setExams(availableExams)
      setSubjects(availableSubjects)
      if (examResult.error || subjectResult.error) {
        setLoadError('Sınavlar veya dersler yüklenirken bir hata oluştu. Lütfen tekrar dene.')
      }

      try {
        const saved = localStorage.getItem(STORAGE_PREFIX + targetUserId)
        if (saved) {
          const parsed: unknown = JSON.parse(saved)
          const restored = readActiveMockExam(parsed)
          if (restored) {
            setActiveExam(restored)
            setSelectedExamId(restored.examId)
            setSelectedSubjectId(restored.subjectId || '')
            setMode(restored.mode)
            // Persist upgrades (stable session ID and mode) for previously saved timers.
            localStorage.setItem(STORAGE_PREFIX + targetUserId, JSON.stringify(restored))
          } else {
            localStorage.removeItem(STORAGE_PREFIX + targetUserId)
          }
        } else {
          const firstExam = availableExams[0]
          setSelectedExamId(firstExam?.id || '')
          setSelectedSubjectId('')
        }
      } catch {
        localStorage.removeItem(STORAGE_PREFIX + targetUserId)
      }
      setNow(Date.now())
      setLoading(false)
    }

    void load()
    return () => { cancelled = true }
  }, [impersonatedUserId])

  useEffect(() => {
    if (!activeExam) return
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [activeExam])

  const elapsedSeconds = activeExam ? Math.max(0, Math.floor((now - activeExam.startedAt) / 1000)) : 0
  const remainingSeconds = activeExam?.mode === 'countdown' && activeExam.endsAt !== null
    ? Math.max(0, Math.ceil((activeExam.endsAt - now) / 1000))
    : null
  const countdownFinished = activeExam?.mode === 'countdown' && remainingSeconds === 0
  const selectedExam = exams.find(exam => exam.id === selectedExamId)
  const matchingSubjects = subjects.filter(subject => subject.exam_id === selectedExamId)
  const progress = activeExam?.mode === 'countdown' && remainingSeconds !== null && activeExam.durationMinutes > 0
    ? Math.min(100, Math.max(0, ((activeExam.durationMinutes * 60 - remainingSeconds) / (activeExam.durationMinutes * 60)) * 100))
    : 0

  const routeToQuestionEntry = useCallback(async (exam: ActiveMockExam, requestedEndAt = Date.now()) => {
    if (routedToResults.current || savingRef.current) return
    routedToResults.current = true
    savingRef.current = true
    setSaving(true)
    setRecordingError('')

    const endAt = Math.max(exam.startedAt, Math.min(
      requestedEndAt,
      exam.mode === 'countdown' && exam.endsAt !== null ? exam.endsAt : requestedEndAt,
    ))
    pendingEndAt.current = endAt
    const elapsedMilliseconds = Math.max(0, endAt - exam.startedAt)
    const elapsedMinutes = Math.round((elapsedMilliseconds / 60_000) * 1_000_000) / 1_000_000

    try {
      if (!userId) throw new Error('Kullanıcı oturumu bulunamadı. Lütfen tekrar giriş yap.')
      if (elapsedMinutes > 0) {
        const { error } = await supabase.from('study_sessions').upsert({
          id: exam.sessionId,
          user_id: userId,
          subject_id: exam.subjectId || null,
          resource_id: null,
          session_type: 'mock_exam',
          started_at: new Date(exam.startedAt).toISOString(),
          ended_at: new Date(endAt).toISOString(),
          duration_minutes: elapsedMinutes,
          note: `${exam.examName} · ${exam.title}`,
          is_edited: false,
        }, { onConflict: 'id', ignoreDuplicates: true })
        if (error) throw error
        window.dispatchEvent(new Event('study-session-saved'))
      }

      localStorage.removeItem(STORAGE_PREFIX + userId)
      pendingEndAt.current = null
      const params = new URLSearchParams({
        mockExam: '1',
        examId: exam.examId,
        title: exam.title,
        date: exam.date,
      })
      navigate(`/results?${params.toString()}`)
    } catch (error) {
      console.error('Mock exam session logging failed:', error)
      routedToResults.current = false
      setRecordingError('Deneme süresi çalışma geçmişine kaydedilemedi. Bağlantını kontrol edip yeniden dene; sayaç kaydın korunuyor.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [navigate, userId])

  useEffect(() => {
    if (activeExam?.mode === 'countdown' && remainingSeconds === 0 && activeExam.endsAt !== null) {
      void routeToQuestionEntry(activeExam, activeExam.endsAt)
    }
  }, [activeExam, remainingSeconds, routeToQuestionEntry])

  const startExam = () => {
    if (!selectedExam) {
      void Swal.fire({ icon: 'warning', title: 'Sınav seç', text: 'Denemeye başlamadan önce bir sınav seçmelisin.' })
      return
    }
    if (selectedSubjectId && !subjects.some(subject => subject.id === selectedSubjectId && subject.exam_id === selectedExam.id)) {
      void Swal.fire({ icon: 'warning', title: 'Ders seçimi geçersiz', text: 'Seçtiğin ders bu sınava ait değil.' })
      return
    }

    const minutes = Number(durationMinutes)
    if (mode === 'countdown' && (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)) {
      void Swal.fire({ icon: 'warning', title: 'Süre geçersiz', text: 'Geri sayım süresi 1 ile 600 dakika arasında tam sayı olmalı. Kronometre modunda süre girmen gerekmez.' })
      return
    }
    if (!userId) return

    const startedAt = Date.now()
    const nextExam: ActiveMockExam = {
      sessionId: crypto.randomUUID(),
      subjectId: selectedSubjectId || null,
      mode,
      examId: selectedExam.id,
      examName: selectedExam.name,
      examColor: selectedExam.color || '#4269a8',
      title: title.trim() || `${selectedExam.name} Denemesi`,
      durationMinutes: mode === 'countdown' ? minutes : 0,
      startedAt,
      endsAt: mode === 'countdown' ? startedAt + minutes * 60_000 : null,
      date: localDayKey(new Date(startedAt)),
    }
    routedToResults.current = false
    setRecordingError('')
    try {
      localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(nextExam))
    } catch {
      void Swal.fire({
        icon: 'error',
        title: 'Deneme başlatılamadı',
        text: 'Tarayıcıya sayaç bilgisi kaydedilemedi. Tarayıcı depolama alanını kontrol edip tekrar dene.',
      })
      return
    }
    setNow(startedAt)
    setActiveExam(nextExam)
  }

  const finishExam = async () => {
    if (!activeExam || saving) return
    if (recordingError && pendingEndAt.current !== null) {
      await routeToQuestionEntry(activeExam, pendingEndAt.current)
      return
    }
    if (activeExam.mode === 'countdown' && remainingSeconds === 0) {
      await routeToQuestionEntry(activeExam, activeExam.endsAt ?? Date.now())
      return
    }

    const confirmation = await Swal.fire({
      title: 'Denemeyi bitirmek istiyor musun?',
      text: activeExam.mode === 'stopwatch'
        ? 'Geçen süre çalışma geçmişine kaydedilecek ve ardından soru girişine geçeceksin.'
        : 'Geçen süre çalışma geçmişine kaydedilecek ve ardından soru girişine geçeceksin.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Bitir ve soruları gir',
      cancelButtonText: 'Denemeye dön',
      confirmButtonColor: '#4269a8',
      reverseButtons: true,
    })
    if (confirmation.isConfirmed) await routeToQuestionEntry(activeExam, Date.now())
  }

  const cancelExam = async () => {
    if (!activeExam || !userId || saving || countdownFinished) return
    const confirmation = await Swal.fire({
      title: 'Denemeyi iptal et?',
      text: 'Bu deneme için sonuç girişi açılmayacak ve çalışma süresi kaydedilmeyecek.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Denemeyi iptal et',
      cancelButtonText: 'Devam et',
      confirmButtonColor: '#dc2626',
      reverseButtons: true,
    })
    if (!confirmation.isConfirmed) return
    localStorage.removeItem(STORAGE_PREFIX + userId)
    routedToResults.current = false
    setActiveExam(null)
    setDurationMinutes('120')
    setTitle('')
    setMode('countdown')
    setRecordingError('')
  }

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-[#718096]">Sınavlar yükleniyor…</div>
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={() => navigate('/study')} className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#62748b] transition hover:text-[#24354a]">
            <ArrowLeft size={16} /> Çalışma alanına dön
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-[#24354a]">Deneme çöz</h1>
        </div>
      </header>

      {loadError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>}

      {activeExam ? (
        <section className="overflow-hidden rounded-3xl border border-[#dce5f0] bg-white shadow-sm">
          {activeExam.mode === 'countdown' && <div className="h-1.5 w-full bg-[#e7edf5]"><div className="h-full transition-[width] duration-1000" style={{ width: `${progress}%`, backgroundColor: activeExam.examColor }} /></div>}
          <div className="flex flex-col items-center px-5 py-8 text-center sm:px-10 sm:py-12">
            <span className="rounded-full px-3 py-1 text-xs font-bold tracking-wide text-white" style={{ backgroundColor: activeExam.examColor }}>
              {activeExam.examName}
            </span>
            <h2 className="mt-4 text-xl font-semibold text-[#24354a]">{activeExam.title}</h2>
            <div className={`my-8 flex items-center gap-3 rounded-2xl border px-5 py-5 sm:px-10 ${activeExam.mode === 'countdown' && remainingSeconds !== null && remainingSeconds <= 300 ? 'border-amber-200 bg-amber-50' : 'border-[#e3e9f0] bg-[#f8fafc]'}`}>
              <Clock3 className={activeExam.mode === 'countdown' && remainingSeconds !== null && remainingSeconds <= 300 ? 'text-amber-600' : 'text-[#4269a8]'} size={28} />
              <span aria-live="off" aria-label={`${activeExam.mode === 'stopwatch' ? 'Geçen süre' : 'Kalan süre'} ${formatDuration(activeExam.mode === 'stopwatch' ? elapsedSeconds : remainingSeconds ?? 0)}`} className={`font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-6xl ${activeExam.mode === 'countdown' && remainingSeconds !== null && remainingSeconds <= 300 ? 'text-amber-700' : 'text-[#24354a]'}`}>
                {formatDuration(activeExam.mode === 'stopwatch' ? elapsedSeconds : remainingSeconds ?? 0)}
              </span>
            </div>
            {activeExam.mode === 'countdown' && remainingSeconds !== null && remainingSeconds <= 300 && remainingSeconds > 0 && (
              <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-amber-700"><AlertTriangle size={16} /> Son 5 dakika!</p>
            )}
            {recordingError && <div className="mb-4 w-full max-w-lg rounded-xl border border-red-200 bg-red-50 p-3 text-left text-sm text-red-700" role="alert">{recordingError}</div>}
            <div className="grid w-full max-w-lg grid-cols-2 gap-3 text-left">
              <div className="rounded-xl bg-[#f8fafc] p-4"><p className="text-xs font-medium text-[#718096]">Başlangıç</p><p className="mt-1 text-sm font-semibold text-[#24354a]">{new Date(activeExam.startedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</p></div>
              <div className="rounded-xl bg-[#f8fafc] p-4"><p className="text-xs font-medium text-[#718096]">{activeExam.mode === 'stopwatch' ? 'Sayaç türü' : 'Belirlenen süre'}</p><p className="mt-1 text-sm font-semibold text-[#24354a]">{activeExam.mode === 'stopwatch' ? 'Kronometre' : `${activeExam.durationMinutes} dakika`}</p></div>
            </div>
            <div className="mt-8 flex w-full max-w-lg flex-col gap-3 sm:flex-row">
              <button type="button" disabled={saving} onClick={() => void finishExam()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#4269a8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#34578f] disabled:cursor-wait disabled:opacity-60">
                <CheckCircle2 size={17} /> {saving ? 'Süre kaydediliyor…' : recordingError ? 'Kaydı yeniden dene' : countdownFinished ? 'Süre doldu — sonuçları gir' : 'Denemeyi bitir ve soruları gir'}
              </button>
              <button type="button" disabled={saving || countdownFinished} onClick={() => void cancelExam()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#e3e9f0] px-4 py-3 text-sm font-semibold text-[#62748b] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50">
                <RotateCcw size={16} /> İptal et
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-[#dce5f0] bg-white p-5 shadow-sm sm:p-8">
          {exams.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#cbd7e6] bg-[#f8fafc] p-6 text-center">
              <AlertTriangle className="mx-auto mb-3 text-[#8190a3]" size={24} />
              <p className="font-semibold text-[#24354a]">Henüz sınav tanımlanmamış</p>
              <p className="mt-1 text-sm text-[#718096]">Deneme çözmek için önce Ayarlar bölümünden bir sınav eklemelisin.</p>
              <button type="button" onClick={() => navigate('/settings')} className="mt-4 rounded-xl bg-[#4269a8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#34578f]">Ayarlara git</button>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-semibold text-[#526a87]">
                Sınav
                <select value={selectedExamId} onChange={event => { setSelectedExamId(event.target.value); setSelectedSubjectId('') }} className="min-h-11 rounded-xl border border-[#dce5f0] bg-white px-3 font-medium text-[#24354a] outline-none focus:border-[#4269a8] focus:ring-2 focus:ring-[#4269a8]/15">
                  {exams.map(exam => <option key={exam.id} value={exam.id}>{exam.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-[#526a87]">
                Branş denemesi (isteğe bağlı)
                <select value={selectedSubjectId} onChange={event => setSelectedSubjectId(event.target.value)} disabled={!matchingSubjects.length} className="min-h-11 rounded-xl border border-[#dce5f0] bg-white px-3 font-medium text-[#24354a] outline-none focus:border-[#4269a8] focus:ring-2 focus:ring-[#4269a8]/15 disabled:bg-[#f8fafc]">
                  <option value="">Branş seç</option>
                  {matchingSubjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
              </label>
              <fieldset className="flex flex-col gap-2 text-sm font-semibold text-[#526a87] md:col-span-2">
                <legend className="mb-2">Sayaç türü</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" aria-pressed={mode === 'countdown'} onClick={() => setMode('countdown')} className={`rounded-xl border p-4 text-left transition ${mode === 'countdown' ? 'border-[#4269a8] bg-[#edf3fb] text-[#24354a] ring-2 ring-[#4269a8]/10' : 'border-[#dce5f0] bg-white text-[#62748b] hover:bg-[#f8fafc]'}`}>
                    <span className="flex items-center gap-2 font-semibold"><AlarmClock size={17} /> Geri sayım</span>
                                      </button>
                  <button type="button" aria-pressed={mode === 'stopwatch'} onClick={() => setMode('stopwatch')} className={`rounded-xl border p-4 text-left transition ${mode === 'stopwatch' ? 'border-[#4269a8] bg-[#edf3fb] text-[#24354a] ring-2 ring-[#4269a8]/10' : 'border-[#dce5f0] bg-white text-[#62748b] hover:bg-[#f8fafc]'}`}>
                    <span className="flex items-center gap-2 font-semibold"><Clock3 size={17} /> Kronometre</span>
                                      </button>
                </div>
              </fieldset>
              {mode === 'countdown' && <label className="flex flex-col gap-2 text-sm font-semibold text-[#526a87] md:col-span-2">
                Süre (dakika)
                <input type="number" min="1" max="600" step="1" value={durationMinutes} onChange={event => setDurationMinutes(event.target.value)} inputMode="numeric" required className="min-h-11 rounded-xl border border-[#dce5f0] bg-white px-3 font-medium text-[#24354a] outline-none focus:border-[#4269a8] focus:ring-2 focus:ring-[#4269a8]/15" />
              </label>}
              <label className="flex flex-col gap-2 text-sm font-semibold text-[#526a87] md:col-span-2">
                Deneme adı <span className="font-normal text-[#8190a3]">(isteğe bağlı)</span>
                <input value={title} onChange={event => setTitle(event.target.value)} maxLength={100} placeholder={selectedExam ? `${selectedExam.name} Denemesi` : 'Deneme adı'} className="min-h-11 rounded-xl border border-[#dce5f0] bg-white px-3 font-medium text-[#24354a] outline-none focus:border-[#4269a8] focus:ring-2 focus:ring-[#4269a8]/15" />
              </label>
              <div className="md:col-span-2">
                <button type="button" onClick={startExam} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#4269a8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#34578f] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                  <Play size={17} fill="currentColor" /> Denemeyi başlat
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
