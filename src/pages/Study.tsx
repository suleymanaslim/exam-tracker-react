import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTimerStore } from '../lib/timerStore'
import Swal from 'sweetalert2'
import CustomSelect from '../components/CustomSelect'
import {
  Timer, Play, Pause, RotateCcw, Plus, Clock,
  Target, CheckCircle2, Coffee, SkipForward, X
} from 'lucide-react'
import { useAdminStore } from '../lib/adminStore'

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
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().split('T')[0])
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
    const todayStr = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('study_sessions').select('*')
      .eq('user_id', uid).gte('started_at', todayStr)
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
        const mondayStr = getMonday(today).toISOString().split('T')[0]
        const todayStr = today.toISOString().split('T')[0]
        
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

        loadTodaySessions(user.id)
      }
    })
  }, [])

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

  const handleReset = () => {
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
      await supabase.from('study_sessions').insert({
        user_id: userId,
        subject_id: selSubject || null,
        resource_id: selResource || null,
        session_type: mode,
        started_at: start.toISOString(),
        ended_at: now.toISOString(),
        duration_minutes: passedMins,
      })
      Swal.fire({ icon: 'success', title: 'Başarılı', text: `${passedMins} dakikalık oturum kaydedildi!`, timer: 2500, showConfirmButton: false })
      loadTodaySessions(userId)
    } else {
      Swal.fire({ icon: 'info', title: 'Kaydedilmedi', text: '1 dakikadan az çalışıldığı için oturum kaydedilmedi.', confirmButtonColor: '#2563eb' })
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
      Swal.fire({ icon: 'warning', title: 'Eksik Bilgi', text: 'Lütfen sınav ve ders seçin.', confirmButtonColor: '#2563eb' })
      return
    }
    if (!manualDuration || Number(manualDuration) <= 0) {
      Swal.fire({ icon: 'warning', title: 'Geçersiz Süre', text: 'Lütfen geçerli bir süre (dakika) girin.', confirmButtonColor: '#2563eb' })
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
        setManualDate(new Date().toISOString().split('T')[0])
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
  const timerColor = isBreak ? '#0d9488' : (isRunning ? '#2563eb' : '#94a3b8')
  const timerBgRing = isBreak ? '#ccfbf1' : '#e2e8f0'

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[#0f172a] flex items-center gap-2">
            {isBreak
              ? <><Coffee className="h-5 w-5 text-teal-500" /> Mola Zamanı</>
              : <><Timer className="h-5 w-5 text-[#2563eb]" /> Çalışma Oturumu</>
            }
          </h1>
          <p className="text-[12px] text-[#64748b]">
            {isBreak ? 'Kısa bir mola ver, ardından devam et.' : 'Pomodoro veya manuel süre ile çalışma kaydı tut.'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {isRunning && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 animate-pulse ${isBreak ? 'bg-teal-50 border border-teal-200' : 'bg-blue-50 border border-blue-200'}`}>
              <div className={`w-2 h-2 rounded-full animate-ping ${isBreak ? 'bg-teal-500' : 'bg-blue-500'}`} />
              <span className={`text-[12px] font-bold tabular-nums ${isBreak ? 'text-teal-700' : 'text-blue-700'}`}>
                {String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')} — {isBreak ? 'Mola' : 'Çalışılıyor'}
              </span>
            </div>
          )}
          <button
            onClick={() => setShowManualModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#2563eb] text-white text-[12px] font-bold hover:bg-blue-600 active:scale-95 transition-all shadow-sm shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Manuel Oturum Ekle
          </button>
        </div>
      </div>

      {/* ══ MOBİL LAYOUT ══════════════════════════════════════════════ */}
      <div className="md:hidden flex flex-col gap-4 flex-1 overflow-y-auto pb-2">
        
        {/* Ders Seçimi */}
        <div className={`rounded-xl border bg-white p-4 flex flex-col gap-3 ${isBreak ? 'border-teal-200' : 'border-[#e2e8f0]'}`}>
          <div>
            <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Sınav</label>
            <select
              value={selExam}
              onChange={e => { setSelExam(e.target.value); setSelSubject(''); setSelResource('') }}
              disabled={isTimerActive}
              className="mt-1 w-full h-11 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[14px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 disabled:opacity-50"
            >
              <option value="">Sınav seç...</option>
              {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Ders</label>
            <select
              value={selSubject}
              onChange={e => { setSelSubject(e.target.value); setSelResource('') }}
              disabled={!selExam || isTimerActive}
              className="mt-1 w-full h-11 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[14px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 disabled:opacity-50"
            >
              <option value="">Ders seç...</option>
              {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {filteredResources.length > 0 && (
            <div>
              <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Kaynak (opsiyonel)</label>
              <select
                value={selResource}
                onChange={e => setSelResource(e.target.value)}
                disabled={!selSubject || isTimerActive}
                className="mt-1 w-full h-11 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[14px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 disabled:opacity-50"
              >
                <option value="">Kaynak seç...</option>
                {filteredResources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Timer Göstergesi */}
        <div className={`rounded-xl border bg-white flex flex-col items-center py-8 gap-6 ${isBreak ? 'border-teal-200 bg-gradient-to-b from-teal-50/30' : 'border-[#e2e8f0]'}`}>
          {isBreak && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-teal-100 text-teal-700 text-[13px] font-bold">
              <Coffee className="h-4 w-4" /> Mola — Dinlen biraz ☕
            </div>
          )}
          
          {/* Circular timer */}
          <div className="relative w-48 h-48 shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="88" fill="none" stroke={timerBgRing} strokeWidth="8" />
              <circle
                cx="100" cy="100" r="88" fill="none"
                stroke={timerColor}
                strokeWidth="8" strokeDasharray={2 * Math.PI * 88}
                strokeDashoffset={2 * Math.PI * 88 * (1 - progress / 100)}
                strokeLinecap="round" className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-4xl font-bold tabular-nums tracking-tight ${isBreak ? 'text-teal-700' : 'text-[#0f172a]'}`}>
                {String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')}
              </span>
              <span className={`text-[11px] font-medium mt-1 ${isBreak ? 'text-teal-500' : 'text-[#94a3b8]'}`}>
                {isBreak
                  ? (isRunning ? '☕ Mola...' : '⏸ Duraklatıldı')
                  : (isRunning ? '🟢 Çalışılıyor' : startedAt ? '⏸ Duraklatıldı' : 'Hazır')
                }
              </span>
            </div>
          </div>

          {/* Kontroller */}
          <div className="flex items-center gap-4">
            {isBreak ? (
              <>
                <button onClick={toggleTimer}
                  className={`h-16 w-16 flex items-center justify-center rounded-3xl text-white shadow-xl transition-all active:scale-95 ${isRunning ? 'bg-teal-500' : 'bg-teal-600'}`}
                >
                  {isRunning ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" fill="currentColor" />}
                </button>
                <button onClick={skipBreak}
                  className="h-12 w-12 flex items-center justify-center rounded-2xl border border-teal-200 bg-white text-teal-600 active:bg-teal-50"
                  title="Molayı Atla"
                >
                  <SkipForward className="h-5 w-5" />
                </button>
              </>
            ) : (
              <>
                <button onClick={handleReset} className="h-12 w-12 flex items-center justify-center rounded-2xl border border-[#e2e8f0] bg-white text-[#64748b]" title="Sıfırla">
                  <RotateCcw className="h-5 w-5" />
                </button>
                <button onClick={toggleTimer} disabled={!selSubject}
                  className={`h-16 w-16 flex items-center justify-center rounded-3xl text-white shadow-xl transition-all disabled:opacity-40 active:scale-95 ${isRunning ? 'bg-orange-500' : 'bg-[#2563eb]'}`}
                >
                  {isRunning ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" fill="currentColor" />}
                </button>
                <button onClick={endEarly} disabled={!startedAt} className="h-12 w-12 flex items-center justify-center rounded-2xl border border-[#e2e8f0] bg-white text-red-500 disabled:opacity-40" title="Erken Bitir">
                  <CheckCircle2 className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {!selSubject && !isBreak && <p className="text-[12px] text-orange-500 font-medium text-center">⚠ Başlamak için yukarıdan ders seçin.</p>}
        </div>

        {/* Hızlı mod seçimi — sadece çalışma modunda ve timer aktif değilken */}
        {!isBreak && !isTimerActive && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setMode('pomodoro_short'); }}
              className={`rounded-xl border p-4 flex flex-col items-center gap-2 transition-all ${mode === 'pomodoro_short' ? 'bg-[#0a1628] border-[#0a1628] text-white' : 'bg-white border-[#e2e8f0] text-[#64748b]'}`}
            >
              <Timer className="h-6 w-6" />
              <span className="text-[13px] font-bold">Kısa</span>
              <span className="text-[11px] opacity-70">{settings.short_focus_minutes} dk</span>
            </button>
            <button
              onClick={() => { setMode('pomodoro_long'); }}
              className={`rounded-xl border p-4 flex flex-col items-center gap-2 transition-all ${mode === 'pomodoro_long' ? 'bg-[#0a1628] border-[#0a1628] text-white' : 'bg-white border-[#e2e8f0] text-[#64748b]'}`}
            >
              <Target className="h-6 w-6" />
              <span className="text-[13px] font-bold">Uzun</span>
              <span className="text-[11px] opacity-70">{settings.long_focus_minutes} dk</span>
            </button>
          </div>
        )}

        {/* Bugünün Planı (mobil) */}
        {todayPlan.length > 0 && (
          <div className="rounded-xl border border-[#e2e8f0] bg-white overflow-hidden">
            <div className="border-b border-[#e2e8f0] px-4 py-3">
              <h3 className="text-[13px] font-bold text-[#0f172a] flex items-center gap-2">
                <Target className="h-4 w-4 text-[#2563eb]" /> Bugünün Planı
              </h3>
            </div>
            <div className="p-3 space-y-2">
              {todayPlan.map(item => {
                const studiedMins = todaySessions
                  .filter(s => s.subject_id === item.subject_id && (!item.resource_id || s.resource_id === item.resource_id))
                  .reduce((acc, s) => acc + s.duration_minutes, 0)
                const isCompleted = studiedMins >= item.planned_minutes
                return (
                  <button
                    key={item.id}
                    onClick={() => loadPlanItem(item)}
                    disabled={isTimerActive}
                    className={`w-full text-left rounded-xl border p-3 flex items-start gap-2.5 disabled:opacity-50 ${isCompleted ? 'border-emerald-200 bg-emerald-50/50' : 'border-[#e2e8f0] bg-white'}`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 mt-1 shrink-0 text-emerald-500" />
                    ) : (
                      <div className="flex h-3 w-3 mt-1.5 shrink-0 rounded-full" style={{ backgroundColor: getExamColor(item.subject_id) }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-bold truncate ${isCompleted ? 'text-emerald-900 line-through' : 'text-[#0f172a]'}`}>{item.title || getSubjectName(item.subject_id)}</p>
                      <p className={`text-[11px] mt-0.5 ${isCompleted ? 'text-emerald-600' : 'text-[#2563eb] font-semibold'}`}>{Math.floor(item.planned_minutes / 60) > 0 ? `${Math.floor(item.planned_minutes / 60)} sa ` : ''}{item.planned_minutes % 60} dk</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ══ DESKTOP LAYOUT ════════════════════════════════════════════ */}
      <div className="hidden md:flex flex-1 min-h-0 flex-col lg:flex-row-reverse gap-4 overflow-y-auto lg:overflow-hidden pb-4 lg:pb-0">
        
        {/* Sağ Panel: Oturum (Timer/Manuel) */}
        <div className={`w-full lg:flex-1 rounded-xl border bg-white flex flex-col overflow-hidden ${isBreak ? 'border-teal-200 bg-gradient-to-b from-teal-50/30 to-white' : 'border-[#e2e8f0]'}`}>
          {/* Seçiciler — timer/mola sırasında disabled */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border-b border-[#e2e8f0] bg-[#f8fafc] shrink-0">
            <div>
              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Sınav</label>
              <CustomSelect
                value={selExam}
                onChange={val => { setSelExam(val); setSelSubject(''); setSelResource('') }}
                disabled={isTimerActive}
                options={exams.map(e => ({ value: e.id, label: e.name }))}
                placeholder="Sınav seç..."
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Ders</label>
              <CustomSelect
                value={selSubject}
                onChange={val => { setSelSubject(val); setSelResource('') }}
                disabled={!selExam || isTimerActive}
                options={filteredSubjects.map(s => ({ value: s.id, label: s.name }))}
                placeholder="Ders seç..."
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Kaynak</label>
              <CustomSelect
                value={selResource}
                onChange={handleResourceChange}
                disabled={!selSubject || isTimerActive}
                options={[
                  ...filteredResources.map(r => ({ value: r.id, label: r.name })),
                  { value: '__new__', label: '+ Yeni Kaynak Ekle' }
                ]}
                placeholder="Kaynak seç (opsiyonel)..."
                className="mt-1"
              />
              {/* Inline yeni kaynak input */}
              {showNewResource && !isTimerActive && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={newResourceName}
                    onChange={e => setNewResourceName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddNewResource(); if (e.key === 'Escape') { setShowNewResource(false); setNewResourceName('') } }}
                    placeholder="Kaynak adı yaz..."
                    className="flex-1 h-8 rounded-lg border border-[#2563eb] px-2.5 text-[11px] focus:outline-none"
                  />
                  <button onClick={handleAddNewResource} className="h-8 w-8 flex items-center justify-center rounded-lg bg-[#2563eb] text-white hover:bg-blue-600 shrink-0">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => { setShowNewResource(false); setNewResourceName('') }} className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#e2e8f0] text-[#94a3b8] hover:bg-[#f1f5f9] shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mode tabs — mola sırasında gizle */}
          {!isBreak && (
            <div className="flex flex-wrap justify-center gap-2 p-4 shrink-0">
              {[
                { key: 'pomodoro_long' as SessionMode, label: `Uzun Pomodoro (${settings.long_focus_minutes} dk)` },
                { key: 'pomodoro_short' as SessionMode, label: `Kısa Pomodoro (${settings.short_focus_minutes} dk)` },
                { key: 'manual' as SessionMode, label: 'Çoklu Pomodoro' },
              ].map(m => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  disabled={isTimerActive}
                  className={`px-4 py-2 rounded-lg text-[12px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    mode === m.key ? 'bg-[#0a1628] text-white shadow-md' : 'bg-[#f8fafc] border border-[#e2e8f0] text-[#64748b] hover:text-[#0f172a]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Timer Area */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-[350px]">
            <div className="flex flex-col items-center gap-6">
                {/* Mola başlığı */}
                {isBreak && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-teal-100 text-teal-700 text-[13px] font-bold">
                    <Coffee className="h-4 w-4" /> Mola — Dinlen biraz ☕
                  </div>
                )}

                {/* Circular timer */}
                <div className="relative w-64 h-64 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                    <circle cx="100" cy="100" r="88" fill="none" stroke={timerBgRing} strokeWidth="8" />
                    <circle
                      cx="100" cy="100" r="88" fill="none"
                      stroke={timerColor}
                      strokeWidth="8" strokeDasharray={2 * Math.PI * 88}
                      strokeDashoffset={2 * Math.PI * 88 * (1 - progress / 100)}
                      strokeLinecap="round" className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-5xl font-bold tabular-nums tracking-tight ${isBreak ? 'text-teal-700' : 'text-[#0f172a]'}`}>
                      {String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')}
                    </span>
                    <span className={`text-[12px] font-medium mt-2 ${isBreak ? 'text-teal-500' : 'text-[#94a3b8]'}`}>
                      {isBreak
                        ? (isRunning ? '☕ Mola devam ediyor...' : '⏸ Mola duraklatıldı')
                        : (isRunning ? '🟢 Çalışılıyor...' : startedAt ? '⏸ Duraklatıldı' : 'Hazır')
                      }
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center items-center gap-4 shrink-0">
                  {isBreak ? (
                    /* Mola kontrolleri */
                    <>
                      <button onClick={toggleTimer}
                        className={`h-16 w-16 flex items-center justify-center rounded-3xl text-white shadow-xl transition-all hover:scale-105 ${
                          isRunning ? 'bg-teal-500 hover:bg-teal-600' : 'bg-teal-600 hover:bg-teal-700'
                        }`}
                      >
                        {isRunning ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" fill="currentColor" />}
                      </button>
                      <button onClick={skipBreak}
                        className="h-12 w-12 flex items-center justify-center rounded-2xl border border-teal-200 bg-white text-teal-600 hover:bg-teal-50 transition-all"
                        title="Molayı Atla"
                      >
                        <SkipForward className="h-5 w-5" />
                      </button>
                    </>
                  ) : (
                    /* Focus kontrolleri */
                    <>
                      <button onClick={handleReset} className="h-12 w-12 flex items-center justify-center rounded-2xl border border-[#e2e8f0] bg-white text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a] transition-all" title="Sıfırla">
                        <RotateCcw className="h-5 w-5" />
                      </button>
                      <button onClick={toggleTimer} disabled={!selSubject}
                        className={`h-16 w-16 flex items-center justify-center rounded-3xl text-white shadow-xl transition-all disabled:opacity-40 hover:scale-105 ${
                          isRunning ? 'bg-orange-500 hover:bg-orange-600' : 'bg-[#2563eb] hover:bg-blue-600'
                        }`}
                      >
                        {isRunning ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" fill="currentColor" />}
                      </button>
                      <button onClick={endEarly} disabled={!startedAt} className="h-12 w-12 flex items-center justify-center rounded-2xl border border-[#e2e8f0] bg-white text-red-500 hover:bg-red-50 transition-all disabled:opacity-40" title="Erken Bitir">
                        <CheckCircle2 className="h-5 w-5" />
                      </button>
                    </>
                  )}
                </div>

                {mode === 'manual' && !isRunning && !startedAt && !isBreak && (
                  <div className="flex flex-col items-center mt-2 animate-in fade-in zoom-in duration-300">
                    <span className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider mb-2">Kaç Pomodoro Çalışacaksın?</span>
                    <div className="flex flex-wrap items-center justify-center gap-2 bg-[#f8fafc] border border-[#e2e8f0] p-1.5 rounded-xl">
                      {[1, 2, 3, 4, 5].map(num => (
                        <button key={num} onClick={() => setPomodoroCount(num)}
                          className={`h-9 w-10 rounded-lg font-bold text-[13px] transition-all ${
                            pomodoroCount === num 
                              ? 'bg-[#2563eb] text-white shadow-md scale-105' 
                              : 'bg-white text-[#64748b] border border-[#e2e8f0] hover:border-[#2563eb] hover:text-[#2563eb]'
                          }`}>
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!selSubject && !isBreak && <p className="text-[12px] text-orange-500 font-medium mt-2 text-center">⚠ Başlamak için yukarıdan sınav ve ders seçin.</p>}
              </div>
          </div>
        </div>
        
        {/* Sol Panel: Bugünün Planı */}
        <div className="w-full lg:w-[300px] shrink-0 flex flex-col gap-3">
          <div className="rounded-xl border border-[#e2e8f0] bg-white flex flex-col lg:h-full overflow-hidden">
            <div className="border-b border-[#e2e8f0] px-4 py-3 shrink-0">
              <h3 className="text-[13px] font-bold text-[#0f172a] flex items-center gap-2">
                <Target className="h-4 w-4 text-[#2563eb]" /> Bugünün Planı
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {todayPlan.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-[#94a3b8] text-[12px] py-6">
                  <Clock className="h-8 w-8 mb-2 opacity-30" />
                  <p>Bugün için plan yok.</p>
                </div>
              ) : (
                todayPlan.map(item => {
                  const studiedMins = todaySessions
                    .filter(s => s.subject_id === item.subject_id && (!item.resource_id || s.resource_id === item.resource_id))
                    .reduce((acc, s) => acc + s.duration_minutes, 0)
                  const isCompleted = studiedMins >= item.planned_minutes
                  return (
                    <button
                      key={item.id}
                      onClick={() => loadPlanItem(item)}
                      disabled={isTimerActive}
                      className={`w-full text-left rounded-lg border p-3 hover:shadow-md transition-all group flex items-start gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                        isCompleted ? 'border-emerald-200 bg-emerald-50/50 opacity-70 hover:border-emerald-300' : 'border-[#e2e8f0] bg-white hover:border-[#2563eb]/30'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-4 w-4 mt-1 shrink-0 text-emerald-500" />
                      ) : (
                        <div className="flex h-3 w-3 mt-1.5 shrink-0 rounded-full" style={{ backgroundColor: getExamColor(item.subject_id) }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] font-bold truncate ${isCompleted ? 'text-emerald-900 line-through' : 'text-[#0f172a]'}`}>{item.title || getSubjectName(item.subject_id)}</p>
                        <p className={`text-[10px] truncate mt-0.5 ${isCompleted ? 'text-emerald-700' : 'text-[#64748b]'}`}>{getSubjectName(item.subject_id)}</p>
                        <p className={`text-[10px] truncate ${isCompleted ? 'text-emerald-600' : 'text-[#94a3b8]'}`}>{getResourceName(item.resource_id)}</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className={`text-[11px] font-bold ${isCompleted ? 'text-emerald-600' : 'text-[#2563eb]'}`}>{Math.floor(item.planned_minutes / 60) > 0 ? `${Math.floor(item.planned_minutes / 60)} sa ` : ''}{item.planned_minutes % 60} dk</p>
                          {studiedMins > 0 && !isCompleted && <p className="text-[9px] text-orange-500 font-medium">{studiedMins} dk çalışıldı</p>}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
        
      </div>

      {/* ══ MANUEL OTURUM EKLE MODAL ══════════════════════════════════ */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#e2e8f0] flex justify-between items-center bg-[#f8fafc]">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#2563eb]">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0f172a]">Manuel Oturum Ekle</h3>
                  <p className="text-[11px] text-[#64748b]">Tamamladığın çalışmayı elle sisteme kaydet.</p>
                </div>
              </div>
              <button
                onClick={() => setShowManualModal(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#e2e8f0] hover:bg-[#f1f5f9] text-[#64748b] transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-3.5">
              {/* Sınav Seçimi */}
              <div>
                <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Sınav <span className="text-red-500">*</span></label>
                <select
                  value={manualExamId}
                  onChange={e => {
                    setManualExamId(e.target.value)
                    setManualSubjectId('')
                    setManualResourceId('')
                  }}
                  className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                >
                  <option value="">Sınav seçiniz...</option>
                  {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              {/* Ders Seçimi */}
              <div>
                <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Ders <span className="text-red-500">*</span></label>
                <select
                  value={manualSubjectId}
                  onChange={e => {
                    setManualSubjectId(e.target.value)
                    setManualResourceId('')
                  }}
                  disabled={!manualExamId}
                  className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 disabled:opacity-50"
                >
                  <option value="">Ders seçiniz...</option>
                  {subjects.filter(s => s.exam_id === manualExamId).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Kaynak Seçimi (Opsiyonel) */}
              <div>
                <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Kaynak <span className="text-[10px] text-[#94a3b8] font-normal">(opsiyonel)</span></label>
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
                  className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 disabled:opacity-50"
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
                      className="flex-1 h-9 rounded-lg border border-[#2563eb] px-2.5 text-[12px] focus:outline-none"
                    />
                    <button
                      onClick={handleAddManualNewResource}
                      className="h-9 w-9 flex items-center justify-center rounded-lg bg-[#2563eb] text-white hover:bg-blue-600 shrink-0"
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
                  <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Süre (Dakika) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="1"
                    value={manualDuration}
                    onChange={e => setManualDuration(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value)))}
                    placeholder="Örn: 45"
                    className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Tarih <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={e => setManualDate(e.target.value)}
                    className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                  />
                </div>
              </div>

              {/* Not (Opsiyonel) */}
              <div>
                <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Not / Açıklama <span className="text-[10px] text-[#94a3b8] font-normal">(opsiyonel)</span></label>
                <input
                  type="text"
                  value={manualNote}
                  onChange={e => setManualNote(e.target.value)}
                  placeholder="Örn: 40 soru çözüldü, dil bilgisi tekrarı yapıldı"
                  className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowManualModal(false)}
                className="px-4 py-2 rounded-xl border border-[#e2e8f0] bg-white text-[#64748b] text-[13px] font-semibold hover:bg-[#f1f5f9] transition-all cursor-pointer"
              >
                İptal
              </button>
              <button
                onClick={handleSaveManualSession}
                disabled={!manualExamId || !manualSubjectId || !manualDuration || manualSaving}
                className="px-5 py-2 rounded-xl bg-[#2563eb] text-white text-[13px] font-bold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
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

