import './Study.css'
import './TimedMockExam.css'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Play } from 'lucide-react'
import Swal from 'sweetalert2'
import { supabase } from '../lib/supabase'
import { useTimerStore } from '../lib/timerStore'
import { persistMockExam, useMockExamStore } from '../lib/mockExamStore'
import { finishMockExam } from '../lib/useMockExamRuntime'
import { formatMockDuration, mockExamTime, nextNumberedMockTitle } from '../lib/mockExamSession'
import type { ExamMode } from '../lib/mockExamSession'
import type { Exam, Subject } from '../components/study/types'
import { localDayKey } from '../lib/statsPeriod'

interface Props { userId: string | null; exams: Exam[]; subjects: Subject[] }

export default function TimedMockExam({ userId, exams, subjects }: Props) {
  const navigate = useNavigate()
  const { ownerId, active, now, saving, error } = useMockExamStore()
  const study = useTimerStore()
  const [examId, setExamId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<ExamMode>('countdown')
  const [minutes, setMinutes] = useState('80')
  const [starting, setStarting] = useState(false)
  const [formError, setFormError] = useState('')
  const startingRef = useRef(false)
  const clockRef = useRef<HTMLHeadingElement>(null)
  const current = ownerId === userId ? active : null
  const busyStudy = study.isRunning || !!study.startedAt || !!study.recovery || study.isFinishing || study.phase === 'break'
  const selectedExamId = examId || exams[0]?.id || ''
  const selectedExam = exams.find(exam => exam.id === selectedExamId)
  const matchingSubjects = subjects.filter(subject => subject.exam_id === selectedExamId)
  const time = current ? mockExamTime(current, now) : null

  const activeSessionId = current?.sessionId
  useEffect(() => { if (activeSessionId) clockRef.current?.focus() }, [activeSessionId])

  const handleStart = async () => {
    if (!userId || ownerId !== userId || startingRef.current || active) return
    setFormError('')
    if (busyStudy) { setFormError('Önce devam eden çalışma oturumunu bitir.'); return }
    if (!selectedExam) { setFormError('Denemeye başlamadan önce bir sınav seç.'); return }
    if (subjectId && !matchingSubjects.some(subject => subject.id === subjectId)) { setFormError('Bu sınava ait bir branş seç.'); return }
    const duration = Number(minutes)
    if (mode === 'countdown' && (!Number.isInteger(duration) || duration < 1 || duration > 600)) {
      setFormError('Süre 1–600 dakika arasında tam sayı olmalı.'); return
    }
    startingRef.current = true
    setStarting(true)
    try {
      let sessionTitle = title.trim()
      if (!sessionTitle) {
        const { data, error } = await supabase.from('study_sessions').select('note').eq('user_id', userId).eq('session_type', 'mock_exam')
        if (error) throw error
        sessionTitle = nextNumberedMockTitle((data || []).map(item => item.note))
      }
      // Recheck after the asynchronous title lookup; another tab may have started a timer.
      if (useMockExamStore.getState().active) return
      // Read the real start time after title lookup, rather than a rendered clock tick.
      // eslint-disable-next-line react/purity
      const startedAt = Date.now()
      persistMockExam(userId, {
        sessionId: crypto.randomUUID(), subjectId: subjectId || null, mode,
        examId: selectedExam.id, examName: selectedExam.name, examColor: selectedExam.color || '#4269a8',
        title: sessionTitle, durationMinutes: mode === 'countdown' ? duration : 0,
        startedAt, endsAt: mode === 'countdown' ? startedAt + duration * 60_000 : null,
        date: localDayKey(new Date(startedAt)),
      })
    } catch {
      setFormError('Deneme başlatılamadı. Bağlantını ve tarayıcı depolama alanını kontrol edip tekrar dene.')
    } finally { startingRef.current = false; setStarting(false) }
  }

  const finish = async () => {
    if (!current || !userId || saving) return
    if (current.finishedAt !== undefined || (current.endsAt !== null && now >= current.endsAt)) { await finishMockExam(userId); return }
    const result = await Swal.fire({
      title: current.mode === 'countdown' ? 'Denemeyi erken bitir?' : 'Denemeyi bitir?',
      text: 'Geçen süre kaydedilecek ve sonuç girişine geçeceksin.',
      width: 380, customClass: { popup: 'study-save-dialog' }, showCancelButton: true,
      confirmButtonText: 'Bitir ve sonuçları gir', cancelButtonText: 'Devam et', reverseButtons: true,
    })
    if (result.isConfirmed) await finishMockExam(userId)
  }

  const cancel = async () => {
    if (!current || !userId || saving || current.finishedAt !== undefined) return
    const result = await Swal.fire({
      title: 'Denemeyi iptal et?', text: 'Çalışma süresi ve sonuç kaydedilmeyecek.',
      width: 380, customClass: { popup: 'study-save-dialog' }, showCancelButton: true,
      confirmButtonText: 'Denemeyi iptal et', cancelButtonText: 'Devam et', reverseButtons: true,
    })
    const latest = useMockExamStore.getState()
    if (result.isConfirmed && !latest.saving && latest.active?.sessionId === current.sessionId && latest.active.finishedAt === undefined) {
      try { persistMockExam(userId, null); setTitle('') }
      catch { setFormError('Deneme iptal edilemedi. Lütfen tekrar dene.') }
    }
  }

  if (!userId || ownerId !== userId) return <p className="mock-loading" role="status">Deneme yükleniyor…</p>

  return <>
    <div className="mock-toolbar">
      <button type="button" className="study-quiet-link mock-back" onClick={() => navigate('/study')}><ArrowLeft size={14} /> Çalışmaya dön</button>
      <span className="mock-mode-label">Deneme çöz</span>
    </div>
    {current && time ? <div className="mock-active">
      <div className="mock-exam-heading">
        <span className="mock-meta">{current.examName}{current.subjectId ? ` · ${subjects.find(subject => subject.id === current.subjectId)?.name || 'Branş denemesi'}` : ' · Genel deneme'}</span>
        <h2 ref={clockRef} tabIndex={-1}>{current.title}</h2>
      </div>
      <p className="mock-clock-label">{current.mode === 'countdown' ? 'Kalan süre' : 'Geçen süre'}</p>
      <div className="study-zen-clock has-hours mock-clock" role="timer" aria-label={current.mode === 'countdown' ? 'Kalan süre' : 'Geçen süre'}>
        {formatMockDuration(current.mode === 'countdown' ? time.remaining ?? 0 : time.elapsed).split(':').map((part, index) => <span key={index}>{index > 0 && <span className="study-clock-colon">:</span>}{part}</span>)}
      </div>
      {current.mode === 'countdown' && <p className="mock-elapsed">Geçen süre <span>{formatMockDuration(time.elapsed)}</span></p>}
      {error && <p className="mock-error" role="alert">{error}</p>}
      <div className="mock-actions">
        <button type="button" disabled={saving || current.recorded} onClick={() => void finish()} className="study-button study-button-primary"><CheckCircle2 size={16} />{saving ? 'Süre kaydediliyor…' : error ? 'Kaydı yeniden dene' : 'Bitir ve sonuçları gir'}</button>
        {current.finishedAt === undefined && <button type="button" disabled={saving} onClick={() => void cancel()} className="study-utility">Denemeyi iptal et</button>}
      </div>
    </div> : <form className="mock-setup" onSubmit={event => { event.preventDefault(); void handleStart() }}>
      <div className="mock-setup-heading"><h2>Denemeye hazırlan</h2><p>Sınavını ve sayacını seç, hazır olduğunda başla.</p></div>
      {!exams.length ? <div className="mock-empty"><p>Önce bir sınav ekle.</p><button type="button" className="study-button study-button-secondary" onClick={() => navigate('/settings')}>Ayarlara git</button></div> : <>
        <fieldset className="mock-fields" disabled={starting}>
          <label>Sınav<select value={selectedExamId} onChange={event => { setExamId(event.target.value); setSubjectId(''); setFormError('') }}>{exams.map(exam => <option key={exam.id} value={exam.id}>{exam.name}</option>)}</select></label>
          <label>Branş <span className="mock-optional">(isteğe bağlı)</span><select value={subjectId} onChange={event => setSubjectId(event.target.value)} disabled={!matchingSubjects.length}><option value="">Genel deneme</option>{matchingSubjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <fieldset className="mock-counter-type"><legend>Sayaç türü</legend><div className="study-segments" role="group" aria-label="Sayaç türü">{([{ value: 'countdown', label: 'Geri sayım' }, { value: 'stopwatch', label: 'Kronometre' }] as const).map(option => <button type="button" key={option.value} aria-pressed={mode === option.value} className={mode === option.value ? 'is-selected' : ''} onClick={() => { setMode(option.value); setFormError('') }}>{option.label}</button>)}</div></fieldset>
          {mode === 'countdown' && <div className="mock-duration-field"><label htmlFor="mock-duration">Süre <span className="mock-optional">(dakika)</span></label><div className="mock-duration"><div className="study-focus-length" role="group" aria-label="Hızlı süre seçimi">{[80, 180].map(duration => <button type="button" key={duration} aria-pressed={Number(minutes) === duration} className={Number(minutes) === duration ? 'is-selected' : ''} onClick={() => setMinutes(String(duration))}>{duration} dk</button>)}</div><input id="mock-duration" aria-label="Özel süre (dakika)" type="number" inputMode="numeric" min="1" max="600" step="1" required value={minutes} onChange={event => setMinutes(event.target.value)} /></div></div>}
          <label className="mock-title-field">Deneme adı <span className="mock-optional">(isteğe bağlı)</span><input value={title} onChange={event => setTitle(event.target.value)} maxLength={100} placeholder="Otomatik numaralandırılır" aria-describedby="mock-title-help" /><span id="mock-title-help" className="mock-help">Boş bırakırsan Deneme - 1, Deneme - 2 şeklinde kaydedilir.</span></label>
        </fieldset>
        {busyStudy && <p className="mock-help">Devam eden çalışma oturumunu önce <button type="button" className="study-quiet-link underline" onClick={() => navigate('/study')}>çalışma alanında bitir.</button></p>}
        {formError && <p className="mock-error" role="alert">{formError}</p>}
        <button type="submit" className="study-button study-button-primary mock-start" disabled={starting || busyStudy}><Play size={15} fill="currentColor" />{starting ? 'Başlatılıyor…' : 'Denemeyi başlat'}</button>
      </>}
    </form>}
  </>
}
