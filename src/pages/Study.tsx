import './Study.css'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTimerStore } from '../lib/timerStore'
import { saveTimerSession } from '../lib/useGlobalTimer'
import { recoveryFor, isCountUp } from '../lib/timerRecovery'
import Swal from 'sweetalert2'
import { Plus } from 'lucide-react'
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
import TaskSidebar from '../components/study/TaskSidebar'
import SessionSetup from '../components/study/SessionSetup'
import FocusTimer from '../components/study/FocusTimer'
import TimerControls from '../components/study/TimerControls'
import ManualSessionDialog from '../components/study/ManualSessionDialog'
import type { Exam, Subject, Resource, PomodoroSettings, PlanItem, SessionMode, SelectionSource, TaskRow } from '../components/study/types'

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
  const [selectionSource, setSelectionSource] = useState<SelectionSource>(() => useTimerStore.getState().selSubject ? 'free' : 'plan')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

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
    const current = useTimerStore.getState()
    if (!current.selSubject || !userId || current.ownerId !== userId || current.recovery || current.isFinishing) return
    if (current.isRunning) current.pauseTimer()
    else {
      unlockTimerAlarm()
      const task = mode === 'questions' && selectionSource === 'plan' ? questionPlans.find(item => item.id === selectedTaskId) : null
      if (!current.startedAt && task?.subject_id && task.subjects?.exam_id) {
        current.startQuestions({ examId: task.subjects.exam_id, subjectId: task.subject_id, resourceId: task.resource_id, planId: task.id, target: task.target_questions, date: task.date })
      } else current.startTimer()
    }
  }

  const handleReset = async () => {
    const current = useTimerStore.getState()
    if (current.ownerId !== userId || current.recovery || current.isFinishing) return
    if (current.startedAt) {
      const result = await Swal.fire({ title: 'Oturumu sıfırla?', text: 'Bu oturumun süresi kaydedilmeyecek.', width: 380, customClass: { popup: 'study-save-dialog' }, showCancelButton: true, confirmButtonText: 'Sıfırla', cancelButtonText: 'Vazgeç' })
      if (!result.isConfirmed) return
    }
    const state = useTimerStore.getState()
    if (state.ownerId !== current.ownerId || state.sessionId !== current.sessionId) return
    resetTimer(isCountUp(mode) ? 0 : storedFocusSeconds || focusSeconds)
  }

  const skipBreak = () => {
    useTimerStore.getState().finishBreak()
  }

  const endEarly = async () => {
    const timer = useTimerStore.getState()
    if (!timer.startedAt || timer.recovery || timer.isFinishing || timer.ownerId !== userId) return
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
        ...questionCompletionOptions('', undefined, undefined, false, session.questionTarget, { ownerId: session.ownerId, subjectId: session.subjectId }), title: 'Kaç soru çözdün?',
        width: 420, customClass: { popup: 'study-save-dialog' },
        showCancelButton: true, confirmButtonText: 'Kaydet', cancelButtonText: 'Çalışmaya dön',
        showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
        preConfirm: async value => {
          if (useTimerStore.getState().ownerId !== session.ownerId || useTimerStore.getState().sessionId !== session.id) return false
          const pending = useTimerStore.getState().recovery
          const answers = pending?.id === session.id && pending.solvedQuestions != null ? { solved_questions: pending.solvedQuestions, correct_questions: pending.correctQuestions ?? null, wrong_questions: pending.wrongQuestions ?? null, note: pending.questionNote ?? null } : readQuestionAnswers(value)
          if (!answers) return false
          const completed = { ...session, solvedQuestions: answers.solved_questions, correctQuestions: answers.correct_questions, wrongQuestions: answers.wrong_questions, questionNote: answers.note }
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
        void Swal.fire({ title: `${result.value.solvedQuestions} soru kaydedildi`, width: 380, customClass: { popup: 'study-save-dialog' }, timer: 1500, showConfirmButton: false })
      } else if (!state.recovery && wasRunning) state.startTimer()
      return
    }
    const wasRunning = timer.isRunning
    timer.pauseTimer()
    const current = useTimerStore.getState()
    if (!current.ownerId) return
    const session = recoveryFor({ ...current, ownerId: current.ownerId, startedAt: current.startedAt?.toISOString() || null }, Date.now())
    if (!session) return
    const canSave = session.durationMinutes > 0 && (session.mode === 'stopwatch' || session.durationMinutes >= 1)
    const durationLabel = session.mode === 'stopwatch' ? `${Math.floor(session.remainingSeconds / 60)} dk ${session.remainingSeconds % 60} sn` : `${session.durationMinutes} dk`
    useTimerStore.setState({ isFinishing: true })
    const result = await Swal.fire({
      title: 'Oturumu tamamla',
      text: canSave ? `${selectedSubject?.name || 'Çalışma'} · ${durationLabel}` : 'Bir dakikadan kısa süre kaydedilmeyecek.',
      width: 380, customClass: { popup: 'study-save-dialog' }, showCancelButton: true,
      confirmButtonText: canSave ? 'Kaydet ve bitir' : 'Oturumu bitir', cancelButtonText: 'Çalışmaya dön',
      showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async () => {
        const state = useTimerStore.getState()
        if (state.ownerId !== session.ownerId || state.sessionId !== session.id) return false
        // Freeze the UUID and duration before sending so retries cannot count twice.
        useTimerStore.setState({ recovery: { ...session, reason: 'save-failed' } })
        try { await saveTimerSession(session); return true }
        catch { Swal.showValidationMessage('Kaydedilemedi. Süren korunuyor; tekrar deneyebilirsin.'); return false }
      },
    })
    const state = useTimerStore.getState()
    if (state.ownerId !== session.ownerId || state.sessionId !== session.id) return
    useTimerStore.setState({ isFinishing: false })
    if (result.isConfirmed) {
      state.resetTimer(current.focusSeconds)
      void Swal.fire({ title: canSave ? 'Oturum kaydedildi' : 'Oturum bitirildi', width: 380, customClass: { popup: 'study-save-dialog' }, timer: 1500, showConfirmButton: false })
    } else if (!state.recovery && wasRunning) state.startTimer()
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
    const current = useTimerStore.getState()
    if (current.isRunning || current.startedAt || current.recovery || current.isFinishing || current.phase === 'break' || current.ownerId !== userId) return
    if (!item.subject_id) return
    const sub = subjects.find(s => s.id === item.subject_id)
    if (!sub) return
    if (current.mode === 'questions' && !returnToStudy()) return
    setSelectionSource('plan')
    setSelectedTaskId(item.id)
    setSelExam(sub.exam_id)
    setSelSubject(item.subject_id)
    setSelResource(item.resource_id ?? '')
  }

  // ── Derived values ─────────────────────────────────────────────────
  const playlistResources = resources.filter(resource => resource.subject_id === selSubject && resource.resource_type === 'video_ders' && playlistURL(resource.url))

  const [todayKey] = useState(() => localDayKey(new Date()))
  const progress = totalSeconds > 0 ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0

  const isTimerActive = isRunning || !!startedAt || phase === 'break' || !!recovery

  const getSubjectName = (id: string | null) => subjects.find(s => s.id === id)?.name ?? ''

  // Mola teması
  const isBreak = phase === 'break'
  const formatDuration = (minutes: number) => { const value = Math.max(0, Math.round(minutes)); return `${Math.floor(value / 60) ? `${Math.floor(value / 60)} sa ` : ''}${value % 60} dk` }
  const selectedSubject = subjects.find(subject => subject.id === selSubject)
  const selectedResource = resources.find(resource => resource.id === selResource)
  const selectedDayVideoCount = selResource ? todayPlan.filter(item => item.resource_id === selResource && item.subject_id === selSubject).reduce((sum, item) => sum + (item.video_count || 0), 0) : 0
  const activePlaylistURL = playlistURL(selectedResource?.url)
  const changeMode = (nextMode: SessionMode) => {
    const current = useTimerStore.getState()
    if (isTimerActive || current.isFinishing || current.ownerId !== userId) return
    if (current.mode === 'questions' && nextMode === 'pomodoro_short' && current.previousStudyMode !== 'stopwatch') returnToStudy()
    else setMode(nextMode)
    if (nextMode === 'questions') { setSelectionSource('free'); setSelectedTaskId(null); setSelResource('') }
  }
  const changeSource = (source: SelectionSource) => {
    if (isTimerActive || isFinishing || source === selectionSource) return
    setSelectionSource(source)
    setSelectedTaskId(null)
    if (source === 'plan') { setSelSubject(''); setSelResource('') }
  }
  const selectQuestion = (id: string) => {
    const task = questionPlans.find(item => item.id === id)
    if (!task?.subject_id || !task.subjects?.exam_id || isTimerActive || isFinishing || ownerId !== userId) return
    setSelectionSource('plan'); setSelectedTaskId(id)
    stopTimerAlarm(); unlockTimerAlarm()
    startQuestions({ examId: task.subjects.exam_id, subjectId: task.subject_id, resourceId: task.resource_id, planId: task.id, target: task.target_questions, date: task.date })
  }
  const studiedToday = (subjectId: string | null) => Math.round(todaySessions.filter(session => session.subject_id === subjectId).reduce((sum, session) => sum + Number(session.duration_minutes || 0), 0))
  const taskRows: TaskRow[] = todayPlan.map(item => {
    const studied = todaySessions.filter(session => session.subject_id === item.subject_id && (!item.resource_id || session.resource_id === item.resource_id)).reduce((sum, session) => sum + Number(session.duration_minutes || 0), 0)
    return { id: item.id, name: getSubjectName(item.subject_id) || 'Çalışma', detail: item.planned_minutes > 0 ? `${formatDuration(item.planned_minutes)} plan` : 'Günlük plan', todayMinutes: studiedToday(item.subject_id), kind: item.video_count != null ? 'video' : 'study', done: item.planned_minutes > 0 && studied >= item.planned_minutes, disabled: !item.subject_id || !subjects.some(subject => subject.id === item.subject_id) || ownerId !== userId }
  })
  const questionRows: TaskRow[] = questionPlans.map(task => ({ id: task.id, name: task.subjects?.name || 'Ders kaldırıldı', detail: `${task.solved_questions} / ${task.target_questions} soru${task.period === 'week' ? ' · Haftalık' : task.date < todayKey ? ' · Bekleyen' : ''}`, todayMinutes: studiedToday(task.subject_id), kind: 'questions', done: task.target_questions != null && task.solved_questions >= task.target_questions, disabled: !task.subject_id || !task.subjects?.exam_id || ownerId !== userId || !!questionError }))
  const activeQuestion = questionPlans.find(task => task.id === (questionPlanId || selectedTaskId))
  const timerDetail = mode === 'questions'
    ? activeQuestion ? `${activeQuestion.solved_questions} / ${activeQuestion.target_questions} soru` : 'Ek soru çözümü'
    : selectedDayVideoCount > 0 ? `${selectedDayVideoCount} video` : mode === 'manual' ? `${focusMinutes} dk kesintisiz odak` : ''
  const savedTodayMinutes = todaySessions.reduce((sum, session) => sum + Number(session.duration_minutes || 0), 0)

  return (
    <div className={`study-page ${isTimerActive ? 'is-zen' : ''}`}>
      <header className="study-header flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Çalışma alanı</h1>
        {!isTimerActive && <div className="flex flex-wrap items-center gap-2">
          <FocusReset onOpen={() => { stopTimerAlarm(); if (isRunning && phase === 'focus') pauseTimer() }} />
          <button type="button" className="study-button study-button-secondary" onClick={() => setShowManualModal(true)}><Plus size={14} /> Çalışma ekle</button>
        </div>}
      </header>

      {recovery && <div className="study-recovery-banner flex flex-wrap items-center justify-between gap-2" role="status"><span>Önceki oturumun onay bekliyor.</span><button type="button" className="study-utility" onClick={() => useTimerStore.setState({ recovery: { ...recovery } })}>Oturumu değerlendir</button></div>}

      <div className={`study-workspace ${isTimerActive ? 'is-focus' : ''}`}>
        <TaskSidebar tasks={taskRows} questions={questionRows} selectedId={questionPlanId || selectedTaskId} todayDuration={formatDuration(savedTodayMinutes)} busy={isTimerActive} error={questionError}
          onSelectTask={id => { const item = todayPlan.find(task => task.id === id); if (item) loadPlanItem(item) }} onSelectQuestion={selectQuestion} />
        <section className="study-focus-panel flex min-w-0 flex-col" aria-label={mode === 'questions' ? 'Soru çözümü' : 'Odak oturumu'}>
          {!isTimerActive && <SessionSetup mode={mode} source={selectionSource} examId={selExam} subjectId={selSubject} resourceId={selResource} exams={exams} subjects={subjects} playlists={playlistResources} settings={settings} blocks={pomodoroCount}
            onSource={changeSource} onMode={changeMode}
            onExam={id => { setSelExam(id); setSelSubject(''); setSelResource(''); setSelectedTaskId(null) }}
            onSubject={id => { setSelSubject(id); setSelResource(''); setSelectedTaskId(null) }}
            onResource={setSelResource} onBlocks={setPomodoroCount} onSetting={(key, value) => setSettings(current => ({ ...current, [key]: value }))} />}
          <FocusTimer subject={selectedSubject?.name || ''} playlist={activePlaylistURL} seconds={secondsLeft} countUp={isCountUp(mode)} isBreak={isBreak} active={isTimerActive} running={isRunning} detail={timerDetail} progress={progress}>
            <TimerControls running={isRunning} started={!!startedAt} isBreak={isBreak} saving={isFinishing}
              disabled={!selSubject || !userId || ownerId !== userId || !!recovery || isFinishing || (mode === 'questions' && !!questionError)}
              onToggle={toggleTimer} onFinish={() => void endEarly()} onReset={() => void handleReset()} onSkipBreak={skipBreak} />
            {!selSubject && !isTimerActive && <p className="mt-2 text-xs text-[var(--study-muted)]">{selectionSource === 'plan' ? 'Planından bir görev seç.' : 'Başlamak için ders seç.'}</p>}
          </FocusTimer>
          {isTimerActive && !isRunning && !isBreak && !recovery && <div className="study-paused-utility flex justify-center pb-4">
            <FocusReset onOpen={stopTimerAlarm} />
          </div>}
        </section>
      </div>
      {showManualModal && <ManualSessionDialog exams={exams} subjects={subjects} examId={manualExamId} subjectId={manualSubjectId} duration={manualDuration} date={manualDate} note={manualNote} saving={manualSaving}
        onExam={id => { setManualExamId(id); setManualSubjectId('') }} onSubject={setManualSubjectId} onDuration={setManualDuration} onDate={setManualDate} onNote={setManualNote}
        onSave={() => void handleSaveManualSession()} onClose={() => setShowManualModal(false)} />}
    </div>
  )
}
