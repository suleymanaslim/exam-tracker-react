import './Study.css'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTimerStore } from '../lib/timerStore'
import Swal from 'sweetalert2'
import {
  Timer, Play, Pause, RotateCcw, Plus, Clock,
  Target, CheckCircle2, Coffee, SkipForward, X
} from 'lucide-react'
import { useAdminStore } from '../lib/adminStore'
import { localDayKey } from '../lib/statsPeriod'

interface Exam { id: string; name: string; color: string }
interface Subject { id: string; exam_id: string; name: string }
interface Resource { id: string; subject_id: string; name: string }
interface PomodoroSettings {
  long_focus_minutes: number
  long_break_minutes: number
  short_focus_minutes: number
  short_break_minutes: number
}
interface PlanItem {
  id: string; subject_id: string | null; resource_id: string | null
  title: string | null; planned_minutes: number
}

type SessionMode = 'pomodoro_long' | 'pomodoro_short' | 'manual'

function getMonday(d: Date) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

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
  const [todayPlan, setTodayPlan] = useState<PlanItem[]>([])
  const [pomodoroCount, setPomodoroCount] = useState(2)
  const [todaySessions, setTodaySessions] = useState<any[]>([])

  // Yeni kaynak ekleme
  const [showNewResource, setShowNewResource] = useState(false)
  const [newResourceName, setNewResourceName] = useState('')

  // Manuel Oturum Modal State
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualExamId, setManualExamId] = useState('')
  const [manualSubjectId, setManualSubjectId] = useState('')
  const [manualResourceId, setManualResourceId] = useState('')
  const [manualDuration, setManualDuration] = useState<number | ''>(45)
  const [manualDate, setManualDate] = useState<string>(localDayKey(new Date()))
  const [manualNote, setManualNote] = useState('')
  const [showManualNewResource, setShowManualNewResource] = useState(false)
  const [manualNewResourceName, setManualNewResourceName] = useState('')
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
    deadlineEpoch,
    setIsRunning,
    setSecondsLeft,
    setTotalSeconds,
    setStartedAt,
    setMode,
    setPhase,
    setSelExam,
    setSelSubject,
    setSelResource,
    setDeadlineEpoch,
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
        const mondayStr = localDayKey(getMonday(today))
        const todayStr = localDayKey(today)
        
        Promise.all([
          supabase.from('weekly_plans').select('id').eq('user_id', targetUid).eq('week_start_date', mondayStr).single(),
          supabase.from('video_plan_items').select('*, resources(name, subject_id, avg_video_duration, subjects(name))').eq('user_id', targetUid).eq('date', todayStr)
        ]).then(async ([wp, vpiRes]) => {
          let items: any[] = []
          if (wp.data) {
            const { data: pi } = await supabase.from('plan_items').select('*').eq('weekly_plan_id', wp.data.id).eq('day_of_week', dayOfWeek).order('sort_order')
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

  // ── Focus minutes from settings ────────────────────────────────────
  let focusMinutes = settings.long_focus_minutes
  if (mode === 'pomodoro_short') focusMinutes = settings.short_focus_minutes
  else if (mode === 'manual') focusMinutes = settings.long_focus_minutes * pomodoroCount
  const focusSeconds = focusMinutes * 60

  // ── Break seconds'ı ayarlardan store'a yaz ─────────────────────────
  useEffect(() => {
    const breakMins = mode === 'pomodoro_long' ? settings.long_break_minutes : settings.short_break_minutes
    setBreakSeconds(breakMins * 60)
  }, [mode, settings, setBreakSeconds])

  // ── Initialize timer when mode, settings, or pomodoro count change (only if not running) ──
  useEffect(() => {
    if (!isRunning && !startedAt && phase === 'focus') {
      setSecondsLeft(focusSeconds)
      setTotalSeconds(focusSeconds)
    }
  }, [mode, focusSeconds, pomodoroCount])

  // ── Toggle timer ───────────────────────────────────────────────────
  const toggleTimer = () => {
    if (!selSubject) { alert('Lütfen önce sınav ve ders seçin.'); return }
    if (!isRunning) {
      const now = Date.now()
      if (!startedAt && phase === 'focus') setStartedAt(new Date())
      setDeadlineEpoch(now + secondsLeft * 1000)
      setIsRunning(true)
    } else {
      if (deadlineEpoch !== null) {
        const remaining = Math.max(0, Math.round((deadlineEpoch - Date.now()) / 1000))
        setSecondsLeft(remaining)
        setDeadlineEpoch(null)
      }
      setIsRunning(false)
    }
  }

  const handleReset = async () => {
    if (startedAt) {
      const result = await Swal.fire({ title: 'Oturumu sıfırla?', text: 'Bu oturumdaki süre kaydedilmez. Kaydetmek için bitir düğmesini kullanabilirsin.', icon: 'question', showCancelButton: true, confirmButtonText: 'Sıfırla', cancelButtonText: 'Devam et' })
      if (!result.isConfirmed) return
    }
    resetTimer(focusSeconds)
  }

  const skipBreak = () => {
    setIsRunning(false)
    setDeadlineEpoch(null)
    setPhase('focus')
    setSecondsLeft(focusSeconds)
    setTotalSeconds(focusSeconds)
    setStartedAt(null)
    document.title = 'ExamTracker'
  }

  const endEarly = async () => {
    if (!isRunning && !startedAt) return

    // Mola sırasında erken bitir — sadece skip
    if (phase === 'break') {
      skipBreak()
      return
    }

    const res = await Swal.fire({
      title: 'Erken Bitir',
      text: 'Çalışmayı erken bitirmek istediğinize emin misiniz?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Evet, Bitir',
      cancelButtonText: 'İptal'
    })
    if (!res.isConfirmed) return

    const elapsed = deadlineEpoch !== null
      ? totalSeconds - Math.max(0, Math.round((deadlineEpoch - Date.now()) / 1000))
      : totalSeconds - secondsLeft
    const passedMins = Math.floor(elapsed / 60)

    setIsRunning(false)
    setDeadlineEpoch(null)

    if (passedMins > 0 && userId && selSubject) {
      const start = startedAt ?? new Date(Date.now() - passedMins * 60_000)
      const now = new Date()
      const { error } = await supabase.from('study_sessions').insert({
        user_id: userId,
        subject_id: selSubject || null,
        resource_id: selResource || null,
        session_type: mode,
        started_at: start.toISOString(),
        ended_at: now.toISOString(),
        duration_minutes: passedMins,
      })
      if (error) {
        setSecondsLeft(Math.max(0, totalSeconds - elapsed))
        void Swal.fire('Kaydedilemedi', 'Çalışma süren korunuyor. Kaydetmeyi tekrar deneyebilirsin.', 'error')
        return
      }
      Swal.fire({ icon: 'success', title: 'Başarılı', text: `${passedMins} dakikalık oturum kaydedildi!`, timer: 2500, showConfirmButton: false })
      loadTodaySessions(userId)
    } else {
      Swal.fire({ icon: 'info', title: 'Kaydedilmedi', text: '1 dakikadan az çalışıldığı için oturum kaydedilmedi.', confirmButtonColor: '#4269a8' })
    }

    resetTimer(focusSeconds)
  }

  // ── Resource change handler ──────────────────────────────────────────
  const handleResourceChange = (value: string) => {
    if (value === '__new__') {
      setShowNewResource(true)
      setSelResource('')
    } else {
      setSelResource(value)
      setShowNewResource(false)
    }
  }

  // ── Yeni kaynak ekleme ──────────────────────────────────────────────
  const handleAddNewResource = async () => {
    if (!newResourceName.trim() || !userId || !selSubject) return
    const { data, error } = await supabase.from('resources').insert({
      user_id: userId,
      subject_id: selSubject,
      name: newResourceName.trim(),
      resource_type: 'diger',
    }).select().single()
    if (error) { console.error(error); return }
    setResources(prev => [...prev, data as Resource])
    setSelResource(data.id)
    setNewResourceName('')
    setShowNewResource(false)
  }

  // ── Manuel Oturum Ekleme Handlers ────────────────────────────────────
  const handleAddManualNewResource = async () => {
    if (!manualNewResourceName.trim() || !userId || !manualSubjectId) return
    const { data, error } = await supabase.from('resources').insert({
      user_id: userId,
      subject_id: manualSubjectId,
      name: manualNewResourceName.trim(),
      resource_type: 'diger',
    }).select().single()
    if (error) { console.error(error); return }
    setResources(prev => [...prev, data as Resource])
    setManualResourceId(data.id)
    setManualNewResourceName('')
    setShowManualNewResource(false)
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
        resource_id: manualResourceId || null,
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
        setManualResourceId('')
        setManualDuration(45)
        setManualDate(localDayKey(new Date()))
        setManualNote('')
        setShowManualNewResource(false)
        setManualNewResourceName('')
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
  const filteredResources = resources.filter(r => r.subject_id === selSubject)

  const minutes = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const progress = totalSeconds > 0 ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0

  const isTimerActive = isRunning || !!startedAt || phase === 'break'

  const getSubjectName = (id: string | null) => subjects.find(s => s.id === id)?.name ?? ''
  const getResourceName = (id: string | null) => resources.find(r => r.id === id)?.name ?? ''
  const getExamColor = (sid: string | null) => {
    const sub = subjects.find(s => s.id === sid)
    if (!sub) return '#94a3b8'
    const ex = exams.find(e => e.id === sub.exam_id)
    return ex?.color ?? '#94a3b8'
  }

  // Mola teması
  const isBreak = phase === 'break'
  const todayMinutes = todaySessions.reduce((sum, session) => sum + session.duration_minutes, 0)
  const plannedMinutes = todayPlan.reduce((sum, item) => sum + item.planned_minutes, 0)
  const targetProgress = plannedMinutes > 0 ? Math.min(100, Math.round(todayMinutes / plannedMinutes * 100)) : 0
  const completedFocus = todaySessions.filter(session => session.session_type !== 'manual').length
  const formatDuration = (value: number) => `${Math.floor(value / 60) ? `${Math.floor(value / 60)} sa ` : ''}${value % 60} dk`
  const selectedSubject = subjects.find(subject => subject.id === selSubject)
  const selectedResource = resources.find(resource => resource.id === selResource)
  const modeOptions: { key: SessionMode; label: string; description: string }[] = [
    { key: 'pomodoro_short', label: 'Kısa Pomodoro', description: `${settings.short_focus_minutes} dk odak · ${settings.short_break_minutes} dk mola` },
    { key: 'pomodoro_long', label: 'Uzun Pomodoro', description: `${settings.long_focus_minutes} dk odak · ${settings.long_break_minutes} dk mola` },
    { key: 'manual', label: 'Kesintisiz odak', description: `${settings.long_focus_minutes * pomodoroCount} dk · molasız` },
  ]

  return (
    <div className="study-page">
      <header className="study-header">
        <div><p className="study-eyebrow">ODAKLAN · TAMAMLA · İLERLE</p><h1>Çalışma alanı</h1><p>Dersini seç, ritmini bul. Gerisini zamanlayıcıya bırak.</p></div>
        <button className="study-button study-button-secondary" onClick={() => setShowManualModal(true)}><Plus size={17} /> Çalışma ekle</button>
      </header>

      <section className="study-summary" aria-label="Bugünün özeti">
        <div><span>Bugün çalışılan</span><strong>{formatDuration(todayMinutes)}</strong></div>
        <div><span>Günlük plan</span><strong>{plannedMinutes ? formatDuration(plannedMinutes) : 'Plan yok'}</strong></div>
        <div><span>Oturum</span><strong>{todaySessions.length}<small> / {completedFocus} odak</small></strong></div>
        <div className="study-summary-progress"><span>Hedefe ilerleme</span><strong>{plannedMinutes ? `%${targetProgress}` : '—'}</strong><div className="study-track"><i style={{ width: `${targetProgress}%` }} /></div></div>
      </section>

      <div className="study-grid">
        <section className={`study-card study-focus ${isBreak ? 'study-break' : ''}`}>
          <div className="study-card-heading"><h2><Timer size={18} /> Odak oturumu</h2><span className={`study-status ${isRunning ? 'is-running' : ''}`}>{isBreak ? 'Mola' : isRunning ? 'Çalışılıyor' : startedAt ? 'Duraklatıldı' : 'Hazır'}</span></div>
          <div className="study-modes" role="group" aria-label="Çalışma modu">
            {modeOptions.map(option => <button key={option.key} disabled={isTimerActive} onClick={() => setMode(option.key)} aria-pressed={mode === option.key} className={mode === option.key ? 'selected' : ''}><strong>{option.label}</strong><span>{option.description}</span></button>)}
          </div>
          {mode === 'manual' && <label className="study-block-count">Odak süresi<select disabled={isTimerActive} value={pomodoroCount} onChange={event => setPomodoroCount(Number(event.target.value))}>{[1,2,3,4,5].map(count => <option key={count} value={count}>{count * settings.long_focus_minutes} dakika</option>)}</select></label>}

          <div className="study-selection">
            <label>Sınav<select value={selExam} disabled={isTimerActive} onChange={event => { setSelExam(event.target.value); setSelSubject(''); setSelResource('') }}><option value="">Sınav seç</option>{exams.map(exam => <option key={exam.id} value={exam.id}>{exam.name}</option>)}</select></label>
            <label>Ders<select value={selSubject} disabled={isTimerActive || !selExam} onChange={event => { setSelSubject(event.target.value); setSelResource('') }}><option value="">Ders seç</option>{filteredSubjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <label>Kaynak <span>(isteğe bağlı)</span><select value={selResource} disabled={isTimerActive || !selSubject} onChange={event => handleResourceChange(event.target.value)}><option value="">Kaynak seç</option>{filteredResources.map(resource => <option key={resource.id} value={resource.id}>{resource.name}</option>)}<option value="__new__">+ Yeni kaynak ekle</option></select></label>
          </div>
          {showNewResource && <div className="study-new-resource"><input autoFocus value={newResourceName} onChange={event => setNewResourceName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void handleAddNewResource() }} placeholder="Yeni kaynak adı" aria-label="Yeni kaynak adı" /><button className="study-button study-button-primary" onClick={handleAddNewResource}>Ekle</button><button className="study-icon-button" onClick={() => setShowNewResource(false)} aria-label="Vazgeç"><X size={17} /></button></div>}

          <div className="study-timer">
            <div className="study-timer-context">{isBreak ? <><Coffee size={17} /> Mola zamanı</> : selectedSubject?.name || 'İlk adım: dersini seç'}</div>
            <div className="study-clock" role="timer" aria-label="Kalan süre">{String(minutes).padStart(2, '0')}<span>:</span>{String(secs).padStart(2, '0')}</div>
            <p>{isBreak ? 'Dinlen, ardından yeni bir odak oturumuna geç.' : selectedResource?.name || `${focusMinutes} dakika odak · bildirimle tamamla`}</p>
            <div className="study-timer-progress" role="progressbar" aria-label="Oturum ilerlemesi" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>
            <div className="study-controls">
              <button className="study-icon-button" onClick={isBreak ? skipBreak : handleReset} aria-label={isBreak ? 'Molayı atla' : 'Sayacı sıfırla'} title={isBreak ? 'Molayı atla' : 'Sıfırla'}>{isBreak ? <SkipForward size={19} /> : <RotateCcw size={19} />}</button>
              <button className="study-button study-button-primary study-start" onClick={toggleTimer} disabled={!selSubject}>{isRunning ? <Pause size={19} /> : <Play size={19} />}{isRunning ? 'Duraklat' : startedAt || isBreak ? 'Devam et' : 'Odaklanmaya başla'}</button>
              {!isBreak && <button className="study-icon-button" onClick={endEarly} disabled={!startedAt} aria-label="Çalışmayı bitir ve kaydet" title="Bitir ve kaydet"><CheckCircle2 size={19} /></button>}
            </div>
            <p className="study-timer-hint">{!selSubject ? 'Başlamak için sınav ve ders seçmelisin.' : isBreak ? 'Mola süresi çalışma toplamına eklenmez.' : 'Tamamlanan oturum otomatik kaydedilir.'}</p>
          </div>
          <details className="study-pomodoro-settings"><summary>Pomodoro sürelerini düzenle</summary><div>{([{key: 'short_focus_minutes', label: 'Kısa odak'}, {key: 'short_break_minutes', label: 'Kısa mola'}, {key: 'long_focus_minutes', label: 'Uzun odak'}, {key: 'long_break_minutes', label: 'Uzun mola'}] as const).map(field => <label key={field.key}>{field.label}<input type="number" min="1" max="180" disabled={isTimerActive} value={settings[field.key]} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 1 && value <= 180) setSettings(current => ({ ...current, [field.key]: value })) }} /><span>dk</span></label>)}</div><p>Bu sayfadaki değişiklikler bu kullanım için geçerlidir. Kalıcı sürelerini Ayarlar’dan belirleyebilirsin.</p></details>
        </section>

        <aside className="study-side">
          <section className="study-card study-plan"><div className="study-card-heading"><h2><Target size={18} /> Bugünün planı</h2><span>{todayPlan.length} görev</span></div><p className="study-card-description">Bir görev seçerek ders ve kaynağı hızlıca yükle.</p>
            <div className="study-plan-list">{todayPlan.length === 0 ? <div className="study-empty"><Target size={24} /><p>Bugün için plan bulunmuyor.</p><Link to="/plan">Haftalık planı aç</Link></div> : todayPlan.map(item => {
              const studied = todaySessions.filter(session => session.subject_id === item.subject_id && (!item.resource_id || session.resource_id === item.resource_id)).reduce((sum, session) => sum + session.duration_minutes, 0)
              const done = item.planned_minutes > 0 && studied >= item.planned_minutes
              return <button key={item.id} onClick={() => loadPlanItem(item)} disabled={isTimerActive || !item.subject_id} className={`study-plan-item ${done ? 'is-done' : ''}`}><i style={{ backgroundColor: getExamColor(item.subject_id) }} /><div><strong>{item.title || getSubjectName(item.subject_id) || 'Çalışma'}</strong><span>{getSubjectName(item.subject_id)}{getResourceName(item.resource_id) ? ` · ${getResourceName(item.resource_id)}` : ''}</span><div className="study-plan-metrics"><span>{formatDuration(studied)} / {formatDuration(item.planned_minutes)}</span>{done && <CheckCircle2 size={15} />}</div><div className="study-track"><i style={{ width: `${item.planned_minutes > 0 ? Math.min(100, studied / item.planned_minutes * 100) : 0}%` }} /></div></div></button>
            })}</div>
          </section>
          <section className="study-card study-sessions"><div className="study-card-heading"><h2><Clock size={18} /> Bugünkü oturumlar</h2><span>{formatDuration(todayMinutes)}</span></div><div className="study-session-list">{todaySessions.length === 0 ? <p className="study-empty">İlk oturumun burada görünecek.</p> : todaySessions.map(session => <div className="study-session-item" key={session.id}><i style={{ backgroundColor: getExamColor(session.subject_id) }} /><div><strong>{getSubjectName(session.subject_id) || 'Çalışma'}</strong><span>{new Date(session.started_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · {session.session_type === 'manual' ? 'Manuel kayıt' : session.session_type === 'pomodoro_short' ? 'Kısa Pomodoro' : 'Uzun Pomodoro'}</span></div><b>{formatDuration(session.duration_minutes)}</b></div>)}</div></section>
        </aside>
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
                  <p className="text-[14px] text-[#62748b]">Tamamladığın çalışmayı elle sisteme kaydet.</p>
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
                    setManualResourceId('')
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
                    setManualResourceId('')
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

              {/* Kaynak Seçimi (Opsiyonel) */}
              <div>
                <label className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">Kaynak <span className="text-[13px] text-[#94a3b8] font-normal">(opsiyonel)</span></label>
                <select
                  value={manualResourceId}
                  onChange={e => {
                    if (e.target.value === '__new__') {
                      setShowManualNewResource(true)
                      setManualResourceId('')
                    } else {
                      setManualResourceId(e.target.value)
                      setShowManualNewResource(false)
                    }
                  }}
                  disabled={!manualSubjectId}
                  className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#24354a] focus:outline-none focus:ring-2 focus:ring-[#4269a8]/30 disabled:opacity-50"
                >
                  <option value="">Kaynak seçiniz (opsiyonel)...</option>
                  {resources.filter(r => r.subject_id === manualSubjectId).map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                  {manualSubjectId && <option value="__new__">+ Yeni Kaynak Ekle</option>}
                </select>

                {/* Inline yeni kaynak input */}
                {showManualNewResource && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={manualNewResourceName}
                      onChange={e => setManualNewResourceName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddManualNewResource()
                        if (e.key === 'Escape') { setShowManualNewResource(false); setManualNewResourceName('') }
                      }}
                      placeholder="Kaynak adı yaz..."
                      className="flex-1 h-9 rounded-lg border border-[#4269a8] px-2.5 text-[14px] focus:outline-none"
                    />
                    <button
                      onClick={handleAddManualNewResource}
                      className="h-9 w-9 flex items-center justify-center rounded-lg bg-[#4269a8] text-white hover:bg-blue-600 shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => { setShowManualNewResource(false); setManualNewResourceName('') }}
                      className="h-9 w-9 flex items-center justify-center rounded-lg border border-[#e2e8f0] text-[#94a3b8] hover:bg-[#f1f5f9] shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
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

