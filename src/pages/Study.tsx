import './Study.css'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTimerStore } from '../lib/timerStore'
import { saveTimerSession } from '../lib/useGlobalTimer'
import { recoveryFor, isCountUp } from '../lib/timerRecovery'
import Swal from 'sweetalert2'
import {
  Timer, Play, Pause, RotateCcw, Plus, Clock,
  Target, CheckCircle2, Coffee, SkipForward, X, ArrowLeft, SlidersHorizontal
} from 'lucide-react'
import { useAdminStore } from '../lib/adminStore'
import FocusReset from '../components/FocusReset'
import { playlistURL } from '../lib/playlist'
import { unlockTimerAlarm, stopTimerAlarm } from '../lib/timerAudio'
import { findWeeklyPlans } from '../lib/weeklyPlanDates'
import { localDayKey } from '../lib/statsPeriod'
import { fetchQuestionPlans, questionPlanError } from '../lib/questionPlanData'
import { openQuestionPlans } from '../lib/questionPlan'
import type { QuestionPlan as QuestionTask } from '../lib/questionPlan'
import { questionCompletionOptions, readQuestionAnswers, lockQuestionInputs } from '../lib/questionDialogs'

interface Exam { id: string; name: string; color: string }
interface Subject { id: string; exam_id: string; name: string }
interface Resource { id: string; subject_id: string; name: string; resource_type: string; url: string | null; total_videos?: number | null }
interface PomodoroSettings {
  long_focus_minutes: number
  long_break_minutes: number
  short_focus_minutes: number
  short_break_minutes: number
}
interface PlanItem {
  id: string; subject_id: string | null; resource_id: string | null
  title: string | null; planned_minutes: number; video_count?: number
}

type SessionMode = 'pomodoro_long' | 'pomodoro_short' | 'manual' | 'stopwatch' | 'questions'

export default function Study() {
  const { impersonatedUserId } = useAdminStore()
  // ── UI-only state ──────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null)
  const [exams, setExams] = useState<Exam[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [settings, setSettings] = useState<PomodoroSettings>({
    long_focus_minutes: 50, long_break_minutes: 10,
    short_focus_minutes: 25, short_break_minutes: 5
  })
  const [questionPlans, setQuestionPlans] = useState<QuestionTask[]>([])
  const [questionError, setQuestionError] = useState('')
  const [todayPlan, setTodayPlan] = useState<PlanItem[]>([])
  const [pomodoroCount, setPomodoroCount] = useState(2)
  const [todaySessions, setTodaySessions] = useState<any[]>([])

  // Manuel Oturum Modal State
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualExamId, setManualExamId] = useState('')
  const [manualSubjectId, setManualSubjectId] = useState('')
  const [manualDuration, setManualDuration] = useState<number | ''>(45)
  const [manualDate, setManualDate] = useState<string>(() => localDayKey(new Date()))
  const [manualNote, setManualNote] = useState('')
  const [manualSaving, setManualSaving] = useState(false)

  // ── Global timer store ─────────────────────────────────────────────
  const {
    isRunning,
    secondsLeft,
    totalSeconds,
    startedAt,
    mode,
    phase,
    selExam,
    selSubject,
    selResource,
    ownerId,
    recovery,
    questionPlanId,
    isFinishing,
    startQuestions,
    returnToStudy,
    startTimer,
    pauseTimer,
    focusSeconds: storedFocusSeconds,
    setSecondsLeft,
    setTotalSeconds,
    setMode,
    setSelExam,
    setSelSubject,
    setSelResource,
    setBreakSeconds,
    resetTimer,
  } = useTimerStore()

  // ── Data loading ───────────────────────────────────────────────────
  const loadTodaySessions = async (uid: string) => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    const { data } = await supabase.from('study_sessions').select('*')
      .eq('user_id', uid).gte('started_at', start.toISOString()).lt('started_at', end.toISOString()).order('started_at', { ascending: false })
    if (data) setTodaySessions(data)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const targetUid = impersonatedUserId || user.id
        setUserId(targetUid)
        supabase.from('exams').select('*').eq('user_id', targetUid).then(r => { if (r.data) setExams(r.data) })
        supabase.from('subjects').select('*').eq('user_id', targetUid).then(r => { if (r.data) setSubjects(r.data) })
        supabase.from('resources').select('*').eq('user_id', targetUid).then(r => { if (r.data) setResources(r.data) })
        supabase.from('pomodoro_settings').select('*').eq('user_id', targetUid).single().then(r => { if (r.data) setSettings(r.data) })

        const today = new Date()
        const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay()
        const todayStr = localDayKey(today)
        
        Promise.all([
          findWeeklyPlans(supabase, targetUid, today),
          supabase.from('video_plan_items').select('*, resources(name, subject_id, avg_video_duration, subjects(name))').eq('user_id', targetUid).eq('date', todayStr)
        ]).then(async ([wp, vpiRes]) => {
          let items: any[] = []
          if (wp.data?.length) {
            const { data: pi } = await supabase.from('plan_items').select('*').in('weekly_plan_id', wp.data.map(plan => plan.id)).eq('day_of_week', dayOfWeek).order('sort_order')
            if (pi) items = [...items, ...pi]
          }
          if (vpiRes.data) {
            const vpis = vpiRes.data.map(v => {
              const res = (v as any).resources || {}
              let cleanName = (res?.name || res?.subjects?.name || 'Video').replace(/MEB-AGS|MEB AGS/g, '').trim()
              
              return {
                id: 'vpi_' + v.id,
                weekly_plan_id: 'video',
                day_of_week: dayOfWeek,
                subject_id: res.subject_id || null,
                resource_id: v.resource_id,
                title: `${cleanName} ${v.video_count}`,
                video_count: v.video_count,
                planned_minutes: v.video_count * (res.avg_video_duration || 0),
                sort_order: -1,
                isVideo: true
              }
            })
            items = [...vpis, ...items]
          }
          setTodayPlan(items)
        })

        loadTodaySessions(targetUid)
      }
    })
  }, [impersonatedUserId])

  useEffect(() => {
    const refresh = () => { if (userId) void loadTodaySessions(userId) }
    window.addEventListener('study-session-saved', refresh)
    return () => window.removeEventListener('study-session-saved', refresh)
  }, [userId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const refresh = async () => {
      try {
        const tasks = await fetchQuestionPlans(userId)
        if (!cancelled) { setQuestionPlans(openQuestionPlans(tasks, localDayKey(new Date()))); setQuestionError('') }
      } catch (error) {
        if (!cancelled) { setQuestionPlans([]); setQuestionError(questionPlanError(error as { code?: string })) }
      }
    }
    setQuestionPlans([])
    void refresh()
    window.addEventListener('study-session-saved', refresh)
    window.addEventListener('question-data-changed', refresh)
    return () => { cancelled = true; window.removeEventListener('study-session-saved', refresh)
      window.removeEventListener('question-data-changed', refresh) }
  }, [userId])

  // ── Focus minutes from settings ────────────────────────────────────
  let focusMinutes = settings.long_focus_minutes
  if (mode === 'pomodoro_short') focusMinutes = settings.short_focus_minutes
  else if (mode === 'manual') focusMinutes = settings.long_focus_minutes * pomodoroCount
  const focusSeconds = isCountUp(mode) ? 0 : focusMinutes * 60

  // ── Break seconds'ı ayarlardan store'a yaz ─────────────────────────
  useEffect(() => {
    if (isRunning || startedAt || recovery || phase === 'break') return
    const breakMins = mode === 'pomodoro_long' ? settings.long_break_minutes : settings.short_break_minutes
    setBreakSeconds(breakMins * 60)
  }, [mode, settings, isRunning, startedAt, recovery, phase, setBreakSeconds])

  // ── Initialize timer when mode, settings, or pomodoro count change (only if not running) ──
  useEffect(() => {
    if (ownerId === userId && !isRunning && !startedAt && !recovery && phase === 'focus') {
      setSecondsLeft(focusSeconds)
      setTotalSeconds(focusSeconds)
    }
  }, [mode, focusSeconds, pomodoroCount, ownerId, userId, isRunning, startedAt, recovery, phase, setSecondsLeft, setTotalSeconds])

  // ── Toggle timer ───────────────────────────────────────────────────
  const toggleTimer = () => {
    if (!selSubject || !userId || ownerId !== userId || recovery) return
    if (isRunning) pauseTimer()
    else { unlockTimerAlarm(); startTimer() }
  }

  const handleReset = async () => {
    if (startedAt) {
      const result = await Swal.fire({ title: 'Oturumu sıfırla?', text: 'Bu oturumdaki süre kaydedilmez. Kaydetmek için bitir düğmesini kullanabilirsin.', icon: 'question', showCancelButton: true, confirmButtonText: 'Sıfırla', cancelButtonText: 'Devam et' })
      if (!result.isConfirmed) return
    }
    resetTimer(isCountUp(mode) ? 0 : storedFocusSeconds || focusSeconds)
  }

  const skipBreak = () => {
    useTimerStore.getState().finishBreak()
  }

  const endEarly = async () => {
    if (!startedAt || recovery || isFinishing) return
    if (mode === 'questions') {
      const timer = useTimerStore.getState()
      const wasRunning = timer.isRunning
      timer.pauseTimer()
      const current = useTimerStore.getState()
      if (!current.ownerId) return
      const session = recoveryFor({ ...current, ownerId: current.ownerId, startedAt: current.startedAt?.toISOString() || null }, Date.now())
      if (!session) return
      if (session.durationMinutes <= 0) { void Swal.fire('Henüz süre yok', 'En az bir saniye çalıştıktan sonra kaydedebilirsin.', 'info'); if (wasRunning) current.startTimer(); return }
      useTimerStore.setState({ isFinishing: true })
      const result = await Swal.fire({
        ...questionCompletionOptions('', undefined, undefined, false, session.questionTarget), title: 'Kaç soru çözdün?',
        showCancelButton: true, confirmButtonText: 'Bitir ve kaydet', cancelButtonText: 'Devam et', confirmButtonColor: '#4269a8',
        showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
        preConfirm: async value => {
          if (useTimerStore.getState().ownerId !== session.ownerId || useTimerStore.getState().sessionId !== session.id) return false
          const pending = useTimerStore.getState().recovery
          const answers = pending?.id === session.id && pending.solvedQuestions != null ? { solved_questions: pending.solvedQuestions, correct_questions: pending.correctQuestions ?? null, wrong_questions: pending.wrongQuestions ?? null } : readQuestionAnswers(value)
          if (!answers) return false
          const completed = { ...session, solvedQuestions: answers.solved_questions, correctQuestions: answers.correct_questions, wrongQuestions: answers.wrong_questions }
          // Persist the frozen count and UUID before sending, including network failures/reloads.
          useTimerStore.setState({ recovery: { ...completed, reason: 'save-failed' } })
          lockQuestionInputs()
          try { await saveTimerSession(completed); return completed }
          catch { Swal.showValidationMessage('Kaydedilemedi. Süren ve soru sayın korunuyor; tekrar deneyebilirsin.'); return false }
        },
      })
      const state = useTimerStore.getState()
      if (state.ownerId !== session.ownerId || state.sessionId !== session.id) return
      useTimerStore.setState({ isFinishing: false })
      if (result.isConfirmed) {
        state.resetTimer(0)
        void Swal.fire({ icon: 'success', title: `${result.value.solvedQuestions} soru kaydedildi`, timer: 1800, showConfirmButton: false })
      } else if (!state.recovery && wasRunning) state.startTimer()
      return
    }
    const result = await Swal.fire({ title: 'Çalışmayı bitir ve kaydet?', icon: 'question', showCancelButton: true, confirmButtonText: 'Bitir ve kaydet', cancelButtonText: 'Devam et', confirmButtonColor: '#4269a8' })
    if (!result.isConfirmed) return
    const current = useTimerStore.getState()
    if (!current.ownerId) return
    const session = recoveryFor({ ...current, ownerId: current.ownerId, startedAt: current.startedAt?.toISOString() || null }, Date.now())
    if (!session) return
    pauseTimer()
    try {
      await saveTimerSession(session)
      if (useTimerStore.getState().ownerId !== session.ownerId || useTimerStore.getState().sessionId !== session.id) return
      resetTimer(current.focusSeconds)
      void Swal.fire({ icon: session.durationMinutes ? 'success' : 'info', title: session.durationMinutes ? 'Kaydedildi' : 'Kaydedilmedi', text: session.durationMinutes ? session.mode === 'stopwatch' ? `${Math.floor(session.remainingSeconds / 60)} dk ${session.remainingSeconds % 60} sn kaydedildi.` : `${session.durationMinutes} dakikalık oturum kaydedildi.` : 'Bir dakikadan kısa oturum kaydedilmedi.', timer: 2000, showConfirmButton: false })
    } catch (error) {
      console.error(error)
      void Swal.fire('Kaydedilemedi', 'Çalışma süren korunuyor. Tekrar deneyebilirsin.', 'error')
    }
  }

  const handleSaveManualSession = async () => {
    if (!userId) return
    if (!manualExamId || !manualSubjectId) {
      Swal.fire({ icon: 'warning', title: 'Eksik Bilgi', text: 'Lütfen sınav ve ders seçin.', confirmButtonColor: '#4269a8' })
      return
    }
    if (!manualDuration || Number(manualDuration) <= 0) {
      Swal.fire({ icon: 'warning', title: 'Geçersiz Süre', text: 'Lütfen geçerli bir süre (dakika) girin.', confirmButtonColor: '#4269a8' })
      return
    }

    setManualSaving(true)

    try {
      const baseDate = manualDate ? new Date(manualDate + 'T12:00:00') : new Date()
      const durationMins = Number(manualDuration)
      const startDate = new Date(baseDate.getTime() - durationMins * 60000)

      const { error } = await supabase.from('study_sessions').insert({
        user_id: userId,
        subject_id: manualSubjectId,
        resource_id: null,
        session_type: 'manual',
        started_at: startDate.toISOString(),
        ended_at: baseDate.toISOString(),
        duration_minutes: durationMins,
        note: manualNote.trim() || null,
        is_edited: false
      })

      if (error) {
        console.error('Manual session insert error:', error)
        Swal.fire({ icon: 'error', title: 'Hata', text: 'Oturum eklenirken bir hata oluştu.', confirmButtonColor: '#ef4444' })
      } else {
        Swal.fire({
          icon: 'success',
          title: 'Başarılı',
          text: `${durationMins} dakikalık oturum kaydedildi!`,
          timer: 2000,
          showConfirmButton: false
        })
        loadTodaySessions(userId)
        // Reset modal form
        setShowManualModal(false)
        setManualExamId('')
        setManualSubjectId('')
        setManualDuration(45)
        setManualDate(localDayKey(new Date()))
        setManualNote('')
      }
    } catch (err) {
      console.error(err)
      Swal.fire({ icon: 'error', title: 'Hata', text: 'Bir hata oluştu.', confirmButtonColor: '#ef4444' })
    } finally {
      setManualSaving(false)
    }
  }

  const loadPlanItem = (item: PlanItem) => {
    if (!item.subject_id) return
    const sub = subjects.find(s => s.id === item.subject_id)
    if (!sub) return
    setSelExam(sub.exam_id)
    setSelSubject(item.subject_id)
    setSelResource(item.resource_id ?? '')
  }

  // ── Derived values ─────────────────────────────────────────────────
  const filteredSubjects = subjects.filter(s => s.exam_id === selExam)
  const playlistResources = resources.filter(resource => resource.subject_id === selSubject && resource.resource_type === 'video_ders' && playlistURL(resource.url))

  const [todayKey] = useState(() => localDayKey(new Date()))
  const minutes = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const progress = totalSeconds > 0 ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0

  const isTimerActive = isRunning || !!startedAt || phase === 'break' || !!recovery

  const getSubjectName = (id: string | null) => subjects.find(s => s.id === id)?.name ?? ''
  const getExamColor = (sid: string | null) => {
    const sub = subjects.find(s => s.id === sid)
    if (!sub) return '#94a3b8'
    const ex = exams.find(e => e.id === sub.exam_id)
    return ex?.color ?? '#94a3b8'
  }

  // Mola teması
  const isBreak = phase === 'break'
  const formatDuration = (value: number) => `${Math.floor(value / 60) ? `${Math.floor(value / 60)} sa ` : ''}${value % 60} dk`
  const selectedSubject = subjects.find(subject => subject.id === selSubject)
  const selectedResource = resources.find(resource => resource.id === selResource)
  const selectedDayVideoCount = selResource ? todayPlan.filter(item => item.resource_id === selResource && item.subject_id === selSubject).reduce((sum, item) => sum + (item.video_count || 0), 0) : 0
  const todayVideoCount = todayPlan.reduce((sum, item) => sum + (item.video_count || 0), 0)
  const activePlaylistURL = playlistURL(selectedResource?.url)
  const modeOptions: { key: SessionMode; label: string }[] = [
    { key: 'pomodoro_short', label: `Kısa Pomodoro · ${settings.short_focus_minutes} dk` },
    { key: 'pomodoro_long', label: `Uzun Pomodoro · ${settings.long_focus_minutes} dk` },
    { key: 'manual', label: `Kesintisiz odak · ${settings.long_focus_minutes * pomodoroCount} dk` },
    { key: 'stopwatch', label: 'Kronometre · süre tut' },
    { key: 'questions', label: 'Soru çözümü · kronometre' },
  ]
  const backToStudy = async () => {
    if (!userId || ownerId !== userId || recovery || isFinishing) return
    if (startedAt) await endEarly()
    // An unfinished, cancelled or failed save keeps the question session intact.
    const current = useTimerStore.getState()
    if (current.ownerId === userId) returnToStudy()
  }

  return (
    <div className="study-page">
      <header className="study-header">
        <div><h1>Çalışma alanı</h1></div>
        <div className="study-header-actions"><FocusReset onOpen={() => { stopTimerAlarm(); if (isRunning && phase === 'focus') pauseTimer() }} /><button className="study-button study-button-secondary" onClick={() => setShowManualModal(true)}><Plus size={17} /> Çalışma ekle</button></div>
      </header>

      {recovery && <div className="study-recovery-banner"><span>Önceki oturumun onay bekliyor.</span><button className="study-button study-button-secondary" onClick={() => useTimerStore.setState({ recovery: { ...recovery } })}>Oturumu değerlendir</button></div>}
      {startedAt && !recovery && phase === 'focus' && mode !== 'questions' && activePlaylistURL && <div className="study-playlist-banner"><div><span>{selectedSubject?.name} · oynatma listesi{selectedDayVideoCount > 0 ? ` · Bugün ${selectedDayVideoCount} video` : selectedResource?.total_videos ? ` · ${selectedResource.total_videos} video` : ''}</span><a href={activePlaylistURL} target="_blank" rel="noopener noreferrer">{activePlaylistURL}</a></div><a className="study-button study-button-primary" href={activePlaylistURL} target="_blank" rel="noopener noreferrer"><Play size={17} /> Listeyi aç</a></div>}

      <div className="study-grid">
        <aside className="study-side">
          <section className="study-card study-plan"><div className="study-card-heading"><h2><Target size={18} /> {mode === 'questions' ? 'Soru görevleri' : 'Bugünün planı'}</h2><span>{(mode === 'questions' ? 0 : todayPlan.length) + questionPlans.length} görev{mode !== 'questions' && todayVideoCount > 0 ? ` · ${todayVideoCount} video` : ''}</span></div>
            <div className="study-plan-list">{mode !== 'questions' && todayPlan.length === 0 && questionPlans.length === 0 ? <div className="study-empty"><Target size={24} /><p>Bugün için plan bulunmuyor.</p><Link to="/plan">Haftalık planı aç</Link></div> : (mode === 'questions' ? [] : todayPlan).map(item => {
              const studied = todaySessions.filter(session => session.subject_id === item.subject_id && (!item.resource_id || session.resource_id === item.resource_id)).reduce((sum, session) => sum + session.duration_minutes, 0)
              const subjectStudied = item.subject_id ? todaySessions.filter(session => session.subject_id === item.subject_id).reduce((sum, session) => sum + session.duration_minutes, 0) : 0
              const done = item.planned_minutes > 0 && studied >= item.planned_minutes
              return <button key={item.id} onClick={() => loadPlanItem(item)} disabled={isTimerActive || !item.subject_id} className={`study-plan-item ${done ? 'is-done' : ''}`}><i style={{ backgroundColor: getExamColor(item.subject_id) }} /><div><strong>{getSubjectName(item.subject_id) || 'Çalışma'}</strong><span>{item.video_count != null ? `${item.video_count} video` : 'Günlük plan'}</span><div className="study-plan-metrics"><span>Plan · {formatDuration(item.planned_minutes)}</span>{done && <CheckCircle2 size={15} />}</div><div className="study-plan-today"><span>Bugün çalışılan</span><strong>{subjectStudied.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} dk</strong></div></div></button>
            })}
            {questionPlans.map(task => <button key={`question_${task.id}`} className={`study-plan-item study-question-task ${task.target_questions != null && task.solved_questions >= task.target_questions ? 'is-done' : ''}`} disabled={isTimerActive || !task.subject_id || !task.subjects?.exam_id || ownerId !== userId} onClick={() => {
              if (!task.subject_id || !task.subjects?.exam_id) return
              stopTimerAlarm(); startQuestions({ examId: task.subjects.exam_id, subjectId: task.subject_id, resourceId: task.resource_id, planId: task.id, target: task.target_questions, date: task.date })
            }}><i style={{ backgroundColor: getExamColor(task.subject_id) }} /><div><strong>{task.subjects?.name || 'Ders kaldırıldı'}</strong><span>Soru çöz{task.period === 'week' ? ' · Haftalık hedef' : task.date < todayKey ? ' · Bekleyen hedef' : ''}</span><div className="study-plan-metrics"><span>{task.solved_questions}{task.target_questions ? ` / ${task.target_questions}` : ''} soru çözüldü</span>{task.target_questions != null && task.solved_questions >= task.target_questions && <CheckCircle2 size={15} />}</div></div></button>)}
            <Link className="study-question-link" to="/questions">Soru planını aç</Link>
            {questionError && <p className="study-question-error" role="status">{questionError}</p>}
            <details className="study-extra-questions" open={mode === 'questions' && !isTimerActive ? true : undefined}><summary>Ek soru çözümü</summary>{exams.map(exam => <div className="study-question-subjects" key={exam.id}><strong>{exam.name}</strong><div>{subjects.filter(subject => subject.exam_id === exam.id).map(subject => <button key={subject.id} disabled={isTimerActive || ownerId !== userId || !!questionError} onClick={() => { stopTimerAlarm(); startQuestions({ examId: exam.id, subjectId: subject.id, date: localDayKey(new Date()) }) }}>{subject.name}<Play size={12} /></button>)}</div></div>)}</details>
            </div>
          </section>

        </aside>

        <section className={`study-card study-focus ${isBreak ? 'study-break' : ''}`}>
          <div className="study-card-heading"><h2><Timer size={18} /> {mode === 'questions' ? 'Soru çözümü' : 'Odak oturumu'}</h2><span className={`study-status ${isRunning ? 'is-running' : ''}`}>{isBreak ? 'Mola' : isRunning ? 'Çalışılıyor' : startedAt ? 'Duraklatıldı' : 'Hazır'}</span></div>
          <div className="study-session-toolbar">
            {mode === 'questions' && <button className="study-back-button" disabled={!!recovery || isFinishing || ownerId !== userId} onClick={() => void backToStudy()}><ArrowLeft size={16} />{startedAt ? 'Bitir ve çalışmaya dön' : 'Çalışmaya dön'}</button>}
            <label className="study-mode-control"><span>Sayaç türü</span><select value={mode} disabled={isTimerActive} onChange={event => setMode(event.target.value as SessionMode)}>{modeOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
            {mode === 'manual' && <label className="study-mode-control study-duration-control"><span>Odak süresi</span><select disabled={isTimerActive} value={pomodoroCount} onChange={event => setPomodoroCount(Number(event.target.value))}>{[1,2,3,4,5].map(count => <option key={count} value={count}>{count * settings.long_focus_minutes} dk</option>)}</select></label>}
            {!isCountUp(mode) && <details className="study-duration-settings"><summary><SlidersHorizontal size={15} /> Süreler</summary><div>{([{key: 'short_focus_minutes', label: 'Kısa odak'}, {key: 'short_break_minutes', label: 'Kısa mola'}, {key: 'long_focus_minutes', label: 'Uzun odak'}, {key: 'long_break_minutes', label: 'Uzun mola'}] as const).map(field => <label key={field.key}>{field.label}<input type="number" min="1" max="180" disabled={isTimerActive} value={settings[field.key]} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 1 && value <= 180) setSettings(current => ({ ...current, [field.key]: value })) }} /><span>dk</span></label>)}</div></details>}
          </div>

          {mode !== 'questions' && <div className="study-selection">
            <label>Sınav<select value={selExam} disabled={isTimerActive} onChange={event => { setSelExam(event.target.value); setSelSubject(''); setSelResource('') }}><option value="">Sınav seç</option>{exams.map(exam => <option key={exam.id} value={exam.id}>{exam.name}</option>)}</select></label>
            <label>Ders<select value={selSubject} disabled={isTimerActive || !selExam} onChange={event => { setSelSubject(event.target.value); setSelResource('') }}><option value="">Ders seç</option>{filteredSubjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            {playlistResources.length > 0 && <label>Video oynatma listesi<select value={playlistResources.some(resource => resource.id === selResource) ? selResource : ''} disabled={isTimerActive} onChange={event => setSelResource(event.target.value)}><option value="">Liste seç (isteğe bağlı)</option>{playlistResources.map((resource, index) => <option key={resource.id} value={resource.id}>{selectedSubject?.name}{playlistResources.length > 1 ? ` · Liste ${index + 1}` : ''}{resource.total_videos ? ` · ${resource.total_videos} video` : ''}</option>)}</select></label>}
          </div>}

          <div className="study-timer">
            <div className="study-timer-context">{isBreak ? <><Coffee size={17} /> Mola zamanı</> : selectedSubject?.name || 'Ders seç'}</div>
            {!isBreak && mode !== 'questions' && selectedDayVideoCount > 0 && <span className="study-video-count">Bugünkü planda {selectedDayVideoCount} video</span>}
            {mode === 'questions' && <span className="study-video-count">{questionPlanId ? (() => { const task = questionPlans.find(item => item.id === questionPlanId); return task?.target_questions ? `${task.solved_questions} / ${task.target_questions} soru` : 'Soru çözümü' })() : 'Ek soru çözümü'}</span>}
            <div className="study-clock" role="timer" aria-label={isCountUp(mode) ? 'Çalışılan süre' : 'Kalan süre'}>{String(minutes).padStart(2, '0')}<span>:</span>{String(secs).padStart(2, '0')}</div>
            {!isCountUp(mode) && <div className="study-timer-progress" role="progressbar" aria-label="Oturum ilerlemesi" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>}
            <div className="study-controls">
              <button className="study-icon-button" onClick={isBreak ? skipBreak : handleReset} aria-label={isBreak ? 'Molayı atla' : 'Sayacı sıfırla'} title={isBreak ? 'Molayı atla' : 'Sıfırla'}>{isBreak ? <SkipForward size={19} /> : <RotateCcw size={19} />}</button>
              <button className="study-button study-button-primary study-start" onClick={toggleTimer} disabled={!selSubject || !userId || ownerId !== userId || !!recovery || isFinishing || (mode === 'questions' && !!questionError)}>{isRunning ? <Pause size={19} /> : <Play size={19} />}{isRunning ? 'Duraklat' : startedAt || isBreak ? 'Devam et' : mode === 'questions' ? 'Soru çözmeye başla' : mode === 'stopwatch' ? 'Kronometreyi başlat' : 'Odaklanmaya başla'}</button>
              {!isBreak && <button className={isCountUp(mode) ? 'study-button study-button-secondary' : 'study-icon-button'} onClick={endEarly} disabled={!startedAt || !!recovery || isFinishing} aria-label="Çalışmayı bitir ve kaydet" title="Bitir ve kaydet"><CheckCircle2 size={19} />{isCountUp(mode) && <span>Bitir ve kaydet</span>}</button>}
            </div>
          </div>

        </section>


      </div>

      {/* ══ MANUEL OTURUM EKLE MODAL ══════════════════════════════════ */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#e2e8f0] flex justify-between items-center bg-[#f8fafc]">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#4269a8]">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#24354a]">Manuel Oturum Ekle</h3>
                </div>
              </div>
              <button
                onClick={() => setShowManualModal(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#e2e8f0] hover:bg-[#f1f5f9] text-[#62748b] transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-3.5">
              {/* Sınav Seçimi */}
              <div>
                <label className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">Sınav <span className="text-red-500">*</span></label>
                <select
                  value={manualExamId}
                  onChange={e => {
                    setManualExamId(e.target.value)
                    setManualSubjectId('')
                              }}
                  className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#24354a] focus:outline-none focus:ring-2 focus:ring-[#4269a8]/30"
                >
                  <option value="">Sınav seçiniz...</option>
                  {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              {/* Ders Seçimi */}
              <div>
                <label className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">Ders <span className="text-red-500">*</span></label>
                <select
                  value={manualSubjectId}
                  onChange={e => {
                    setManualSubjectId(e.target.value)
                              }}
                  disabled={!manualExamId}
                  className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#24354a] focus:outline-none focus:ring-2 focus:ring-[#4269a8]/30 disabled:opacity-50"
                >
                  <option value="">Ders seçiniz...</option>
                  {subjects.filter(s => s.exam_id === manualExamId).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Süre (Dakika cinsinden) ve Tarih */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">Süre (Dakika) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="1"
                    value={manualDuration}
                    onChange={e => setManualDuration(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value)))}
                    placeholder="Örn: 45"
                    className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#24354a] focus:outline-none focus:ring-2 focus:ring-[#4269a8]/30"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">Tarih <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={e => setManualDate(e.target.value)}
                    className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#24354a] focus:outline-none focus:ring-2 focus:ring-[#4269a8]/30"
                  />
                </div>
              </div>

              {/* Not (Opsiyonel) */}
              <div>
                <label className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">Not / Açıklama <span className="text-[13px] text-[#94a3b8] font-normal">(opsiyonel)</span></label>
                <input
                  type="text"
                  value={manualNote}
                  onChange={e => setManualNote(e.target.value)}
                  placeholder="Örn: 40 soru çözüldü, dil bilgisi tekrarı yapıldı"
                  className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#24354a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#4269a8]/30"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowManualModal(false)}
                className="px-4 py-2 rounded-xl border border-[#e2e8f0] bg-white text-[#62748b] text-[13px] font-semibold hover:bg-[#f1f5f9] transition-all cursor-pointer"
              >
                İptal
              </button>
              <button
                onClick={handleSaveManualSession}
                disabled={!manualExamId || !manualSubjectId || !manualDuration || manualSaving}
                className="px-5 py-2 rounded-xl bg-[#4269a8] text-white text-[13px] font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                {manualSaving ? 'Kaydediliyor...' : 'Oturumu Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

