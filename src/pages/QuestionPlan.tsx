import './QuestionPlan.css'
import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { BookOpenCheck, Check, ChevronLeft, ChevronRight, Plus, RefreshCw, Play, Pencil, Trash2 } from 'lucide-react'
import Swal from 'sweetalert2'
import { supabase } from '../lib/supabase'
import { useAdminStore } from '../lib/adminStore'
import { questionCount, completedVideo } from '../lib/questionPlan'
import type { QuestionPlan as QuestionTask, QuestionVideo, QuestionLog } from '../lib/questionPlan'
import { fetchQuestionData, fetchQuestionVideos, questionPlanError } from '../lib/questionPlanData'
import { questionInputOptions, questionCompletionOptions, readQuestionAnswers, lockQuestionInputs } from '../lib/questionDialogs'
import { analyzeQuestions } from '../lib/questionAnalytics'
import { localDayKey, mondayOf, weekBounds } from '../lib/statsPeriod'

const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
const htmlText = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
interface Subject { id: string; name: string; exam_id: string; exams: { name: string } | null }

export default function QuestionPlan() {
  const { impersonatedUserId } = useAdminStore()
  const loadVersion = useRef(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [lessons, setLessons] = useState<QuestionVideo[]>([])
  const [plans, setPlans] = useState<QuestionTask[]>([])
  const [logs, setLogs] = useState<QuestionLog[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'plans' | 'videos' | 'logs'>('plans')
  const [search, setSearch] = useState('')
  const [today] = useState(() => localDayKey(new Date()))
  const [week, setWeek] = useState(() => localDayKey(mondayOf(new Date())))
  const { start, end } = weekBounds(week)
  const weekEnd = new Date(end); weekEnd.setDate(weekEnd.getDate() - 1)
  const inWeek = (date: string) => date >= localDayKey(start) && date < localDayKey(end)

  const load = useCallback(async (uid: string) => {
    const version = ++loadVersion.current
    setLoading(true); setError('')
    try {
      const [videos, snapshot, s] = await Promise.all([
        fetchQuestionVideos(uid), fetchQuestionData(uid),
        supabase.from('subjects').select('id,name,exam_id,exams(name)').eq('user_id', uid).order('name'),
      ])
      if (s.error) throw s.error
      if (version !== loadVersion.current) return
      setLessons(videos); setPlans(snapshot.plans); setLogs(snapshot.logs); setSubjects((s.data || []) as unknown as Subject[])
    } catch (failure) { if (version === loadVersion.current) setError(questionPlanError(failure as { code?: string })) }
    finally { if (version === loadVersion.current) setLoading(false) }
  }, [])
  useEffect(() => {
    let cancelled = false
    loadVersion.current++
    setPlans([]); setLessons([]); setLogs([]); setSubjects([]); setUserId(null); setError(''); setLoading(true)
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return
      if (!user) { setLoading(false); return }
      const uid = impersonatedUserId || user.id
      setUserId(uid); void load(uid)
    })
    return () => { cancelled = true; loadVersion.current++ }
  }, [impersonatedUserId, load])
  useEffect(() => {
    if (!userId) return
    const refresh = () => void load(userId)
    window.addEventListener('study-session-saved', refresh)
    return () => window.removeEventListener('study-session-saved', refresh)
  }, [userId, load])

  const afterSave = async () => {
    window.dispatchEvent(new Event('question-data-changed'))
    if (userId) await load(userId)
  }
  const saveTarget = async (lesson?: QuestionVideo, existing?: QuestionTask) => {
    if (!userId || (lesson && !lesson.resources?.subject_id)) return
    let selectedDate = existing?.date || lesson?.date || (week === localDayKey(mondayOf(new Date(`${today}T00:00:00`))) ? today : week)
    const subjectId = existing?.subject_id || lesson?.resources?.subject_id
    const options = questionInputOptions(String(existing?.target_questions || 30))
    const fixed = !!existing || !!lesson
    const result = await Swal.fire({
      ...options, title: existing ? 'Soru hedefini düzenle' : 'Soru hedefi ekle',
      html: (!fixed ? `<label class="question-dialog-date">Ders<select id="question-subject"><option value="">Ders seç</option>${subjects.map(s => `<option value="${htmlText(s.id)}">${htmlText(`${s.exams?.name || ''} · ${s.name}`)}</option>`).join('')}</select></label>` : '')
        + `<label class="question-dialog-date">Hedef dönemi<select id="question-period" ${fixed ? 'disabled' : ''}><option value="day">Günlük</option><option value="week">Haftalık</option></select></label>`
        + options.html + '<label class="question-dialog-date">Gün / hafta<input id="question-date" type="date" required></label>',
      didOpen: () => {
        options.didOpen()
        const input = Swal.getPopup()?.querySelector<HTMLInputElement>('#question-date')
        const period = Swal.getPopup()?.querySelector<HTMLSelectElement>('#question-period')
        if (input) input.value = selectedDate
        if (period) {
          period.value = existing?.period || 'day'
          period.addEventListener('change', () => {
            if (period.value === 'week' && input?.value) input.value = localDayKey(mondayOf(new Date(`${input.value}T00:00:00`)))
          })
        }
      },
      showCancelButton: true, confirmButtonText: 'Kaydet', cancelButtonText: 'İptal', confirmButtonColor: '#4269a8',
      showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async value => {
        const target = questionCount(value), popup = Swal.getPopup()
        const dateInput = popup?.querySelector<HTMLInputElement>('#question-date')
        const subject = subjectId || popup?.querySelector<HTMLSelectElement>('#question-subject')?.value
        const period = popup?.querySelector<HTMLSelectElement>('#question-period')?.value || 'day'
        selectedDate = dateInput?.value || ''
        if (target === null || !dateInput?.checkValidity() || !selectedDate || !subject) { Swal.showValidationMessage('Ders, soru sayısı ve gün seçin.'); return false }
        const { error: saveError } = await supabase.rpc('set_question_target', { p_user_id: userId, p_subject_id: subject, p_date: selectedDate, p_target: target,
          p_period: period, p_video_id: existing?.video_plan_item_id || lesson?.id || null, p_plan_id: existing?.id || null })
        if (saveError) { Swal.showValidationMessage(saveError.code === '23505' ? 'Bu dersin aynı dönemde bir hedefi var; mevcut hedefi düzenleyin.' : questionPlanError(saveError)); return false }
        return true
      },
    })
    if (result.isConfirmed) { setWeek(localDayKey(mondayOf(new Date(`${selectedDate}T00:00:00`)))); setTab('plans'); await afterSave() }
  }
  const addSolved = async (plan: QuestionTask) => {
    if (!userId) return
    const entryId = crypto.randomUUID()
    let pendingAnswers: ReturnType<typeof readQuestionAnswers> = null
    const result = await Swal.fire({
      ...questionCompletionOptions('', undefined, undefined, false, plan.target_questions, { ownerId: userId, subjectId: plan.subject_id }), title: 'Çözülen soru ekle',
      showCancelButton: true, confirmButtonText: 'Ekle', cancelButtonText: 'İptal', confirmButtonColor: '#4269a8',
      showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async value => {
        const answers = pendingAnswers || readQuestionAnswers(value)
        if (!answers || answers.solved_questions < 1) { if (answers) Swal.showValidationMessage('En az 1 soru girin.'); return false }
        pendingAnswers = answers; lockQuestionInputs()
        const { error: saveError } = await supabase.rpc('add_solved_questions', { p_entry_id: entryId, p_question_plan_id: plan.id, p_questions: answers.solved_questions, p_correct: answers.correct_questions, p_wrong: answers.wrong_questions, p_note: answers.note })
        if (saveError) { Swal.showValidationMessage(questionPlanError(saveError)); return false }
        return true
      },
    })
    if (result.isConfirmed) await afterSave()
  }
  const editLog = async (entry: QuestionLog) => {
    const plan = plans.find(p => p.id === entry.question_plan_id)
    const result = await Swal.fire({
      ...questionCompletionOptions(String(entry.solved_questions), entry.correct_questions, entry.wrong_questions, false, plan?.target_questions, { note: entry.note, ownerId: userId, subjectId: plan?.subject_id }),
      title: 'Çözüm kaydını düzenle', showCancelButton: true, confirmButtonText: 'Kaydet', cancelButtonText: 'İptal', confirmButtonColor: '#4269a8',
      showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async value => {
        const answers = readQuestionAnswers(value)
        if (!answers) return false
        const { error: saveError } = await supabase.rpc('update_question_result', { p_entry_id: entry.id, p_questions: answers.solved_questions, p_correct: answers.correct_questions, p_wrong: answers.wrong_questions, p_note: answers.note })
        if (saveError) { Swal.showValidationMessage(questionPlanError(saveError)); return false }
        return true
      },
    })
    if (result.isConfirmed) await afterSave()
  }
  const remove = async (id: string, kind: 'plan' | 'log') => {
    const result = await Swal.fire({ title: kind === 'plan' ? 'Soru planı silinsin mi?' : 'Çözüm kaydı silinsin mi?',
      text: kind === 'plan' ? 'Hedef kaldırılır. Çözülen soruların geçmişi korunur.' : 'Soru sayısı toplamdan çıkarılır. Çalışma süresi korunur.',
      icon: 'question', showCancelButton: true, confirmButtonText: 'Sil', cancelButtonText: 'Vazgeç', confirmButtonColor: '#b94646',
      showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async () => {
        const { error: saveError } = kind === 'plan'
          ? await supabase.rpc('archive_question_plan', { p_plan_id: id })
          : await supabase.rpc('remove_question_result', { p_entry_id: id })
        if (saveError) { Swal.showValidationMessage(questionPlanError(saveError)); return false }
        return true
      },
    })
    if (result.isConfirmed) await afterSave()
  }
  const matches = (name: string) => name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR').trim())
  const weekPlans = plans.filter(plan => !plan.archived_at && inWeek(plan.date))
  const visiblePlans = weekPlans.filter(plan => matches(`${plan.subjects?.name || ''} ${plan.resources?.name || ''}`))
  const weekLessons = lessons.filter(lesson => inWeek(lesson.date))
  const visibleLessons = weekLessons.filter(lesson => matches(`${lesson.resources?.subjects?.name || ''} ${lesson.resources?.name || ''}`))
  const weekLogs = logs.filter(log => inWeek(localDayKey(new Date(log.created_at))))
  const visibleLogs = weekLogs.filter(log => { const plan = plans.find(p => p.id === log.question_plan_id); return matches(`${plan?.subjects?.name || ''} ${plan?.resources?.name || ''} ${log.note || ''}`) }).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const summary = useMemo(() => analyzeQuestions(plans, logs, week), [plans, logs, week])
  const shift = (direction: number) => { const next = new Date(start); next.setDate(next.getDate() + direction * 7); setWeek(localDayKey(next)) }
  return <div className="question-page">
    <header className="question-header"><div><p>SORU ÇALIŞMASI</p><h1>Soru planı</h1></div><div className="question-header-actions"><button className="question-button" disabled={loading || !!error || !subjects.length} onClick={() => void saveTarget()}><Plus size={16} /> Hedef ekle</button><Link className="question-button" to="/study"><Play size={16} /> Çalışmaya geç</Link></div></header>
    <div className="question-week"><strong>{dateLabel(week)} – {dateLabel(localDayKey(weekEnd))}</strong><div><button aria-label="Önceki hafta" onClick={() => shift(-1)}><ChevronLeft size={17} /></button><input type="date" aria-label="Hafta seç" value={week} onChange={e => { if (e.target.value) setWeek(localDayKey(mondayOf(new Date(`${e.target.value}T00:00:00`)))) }} /><button aria-label="Sonraki hafta" onClick={() => shift(1)}><ChevronRight size={17} /></button><button onClick={() => setWeek(localDayKey(mondayOf(new Date())))}>Bu hafta</button></div></div>
    <div className="question-summary"><span><strong>{summary.solved.toLocaleString('tr-TR')}</strong> soru çözüldü</span><span>{summary.target.toLocaleString('tr-TR')} haftalık hedef · {summary.remaining.toLocaleString('tr-TR')} kalan</span></div>
    <div className="question-toolbar"><div className="question-tabs" role="group" aria-label="Soru planı görünümü"><button aria-pressed={tab === 'plans'} onClick={() => setTab('plans')}>Hedefler <span>{weekPlans.length}</span></button><button aria-pressed={tab === 'videos'} onClick={() => setTab('videos')}>Video görevleri <span>{weekLessons.length}</span></button><button aria-pressed={tab === 'logs'} onClick={() => setTab('logs')}>Kayıtlar <span>{weekLogs.length}</span></button></div><input type="search" aria-label="Ders veya konu ara" placeholder="Ders veya konu ara…" value={search} onChange={event => setSearch(event.target.value)} /></div>
    {error && <div className="question-error" role="alert"><span>{error}</span><button onClick={() => userId && void load(userId)}><RefreshCw size={16} /> Tekrar dene</button></div>}
    {loading ? <div className="question-empty">Yükleniyor…</div> : !error && (tab === 'plans' ? <div className="question-cards">
      {visiblePlans.length === 0 && <div className="question-empty"><BookOpenCheck size={28} /><p>{search ? 'Aramaya uygun plan yok.' : 'Bu haftaya bir ders hedefi veya video görevi ekle.'}</p><button className="question-button" onClick={() => void saveTarget()}><Plus size={16} /> Hedef ekle</button></div>}
      {visiblePlans.map(plan => {
        const done = plan.target_questions != null && plan.solved_questions >= plan.target_questions
        return <article className={`question-card ${done ? 'is-done' : ''}`} key={plan.id}>
          <div className="question-card-top"><span>{plan.period === 'week' ? 'Haftalık hedef' : dateLabel(plan.date)}{plan.period !== 'week' && plan.date < today && !done ? ' · Bekliyor' : ''}</span>{done && <span><Check size={14} /> Tamamlandı</span>}</div>
          <h2>{plan.subjects?.name || 'Ders kaldırıldı'}</h2><p>{plan.resources?.name || (plan.period === 'week' ? 'Bu dersteki tüm soru çözümleri' : 'Ders hedefi')}</p>
          <div className="question-count"><strong>{plan.solved_questions}</strong><span>{plan.target_questions ? `/ ${plan.target_questions} soru` : 'soru'}</span></div>
          {plan.target_questions != null && <div className="question-progress" role="progressbar" aria-label="Çözülen sorular" aria-valuenow={Math.min(plan.solved_questions, plan.target_questions)} aria-valuemin={0} aria-valuemax={plan.target_questions}><i style={{ width: `${Math.min(100, plan.solved_questions / plan.target_questions * 100)}%` }} /></div>}
          <div className="question-answers">{plan.answers_recorded && <span>{[plan.correct_recorded ? `${plan.correct_questions} doğru` : '', plan.wrong_recorded ? `${plan.wrong_questions} yanlış` : ''].filter(Boolean).join(' · ')}</span>}</div><div className="question-card-actions"><button className="question-button" onClick={() => void addSolved(plan)}><Plus size={15} /> Çözülen ekle</button><button className="question-icon-button" aria-label={`${plan.subjects?.name || 'Ders'} hedefini düzenle`} onClick={() => void saveTarget(undefined, plan)}><Pencil size={16} /></button><button className="question-icon-button is-danger" aria-label={`${plan.subjects?.name || 'Ders'} planını sil`} onClick={() => void remove(plan.id, 'plan')}><Trash2 size={16} /></button></div>
        </article>
      })}
    </div> : tab === 'videos' ? <div className="question-lessons">
      {visibleLessons.length === 0 && <div className="question-empty"><BookOpenCheck size={28} /><p>{search ? 'Aramaya uygun video yok.' : 'Bu haftada video görevi yok.'}</p><Link className="question-button" to="/videos">Video planını aç</Link></div>}
      {visibleLessons.map(lesson => {
        const existing = plans.find(plan => !plan.archived_at && plan.video_plan_item_id === lesson.id)
        const watched = completedVideo(lesson)
        return <button key={lesson.id} className="question-lesson" disabled={!lesson.resources?.subject_id} onClick={() => void saveTarget(lesson, existing)}><div className="question-lesson-icon">{watched ? <Check size={20} /> : <Play size={20} />}</div><div><strong>{lesson.resources?.subjects?.name || 'Ders kaldırıldı'}</strong><span>{lesson.resources?.name} · {dateLabel(lesson.date)} · {lesson.video_count} video · {watched ? 'İzlendi' : `${lesson.watched_count || 0} izlendi`}</span></div><span className="question-lesson-target">{existing ? `${existing.target_questions} soru` : 'Hedef ekle'}<ChevronRight size={17} /></span></button>
      })}
    </div> : <div className="question-logs">
      {visibleLogs.length === 0 && <div className="question-empty"><BookOpenCheck size={28} /><p>Bu haftada çözüm kaydı yok.</p></div>}
      {visibleLogs.map(entry => { const plan = plans.find(p => p.id === entry.question_plan_id); return <article className="question-log" key={entry.id}><div><strong>{plan?.subjects?.name || 'Ders kaldırıldı'}</strong><span>{new Date(entry.created_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {entry.session_id ? 'Çalışma oturumu' : 'Elle eklendi'}{plan?.archived_at ? ' · Plan silindi' : ''}</span>{entry.note && <p className="question-log-note">{entry.note}</p>}{(entry.correct_questions != null || entry.wrong_questions != null) && <small>{[entry.correct_questions != null ? `${entry.correct_questions} doğru` : '', entry.wrong_questions != null ? `${entry.wrong_questions} yanlış` : ''].filter(Boolean).join(' · ')}</small>}</div><strong className="question-log-count">{entry.solved_questions}<small>soru</small></strong><div className="question-log-actions"><button className="question-icon-button" aria-label="Çözüm kaydını düzenle" onClick={() => void editLog(entry)}><Pencil size={16} /></button><button className="question-icon-button is-danger" aria-label="Çözüm kaydını sil" onClick={() => void remove(entry.id, 'log')}><Trash2 size={16} /></button></div></article> })}
    </div>)}
  </div>
}
