import './QuestionPlan.css'
import { useCallback, useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { BookOpenCheck, Check, ChevronRight, Plus, RefreshCw, Play } from 'lucide-react'
import Swal from 'sweetalert2'
import { supabase } from '../lib/supabase'
import { useAdminStore } from '../lib/adminStore'
import { questionCount } from '../lib/questionPlan'
import type { QuestionPlan as QuestionTask, CompletedQuestionVideo as VideoLesson } from '../lib/questionPlan'
import { fetchQuestionPlans, fetchCompletedQuestionVideos, questionPlanError } from '../lib/questionPlanData'
import { questionInputOptions, questionCompletionOptions, readQuestionAnswers, lockQuestionInputs } from '../lib/questionDialogs'
import { localDayKey } from '../lib/statsPeriod'

const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })

export default function QuestionPlan() {
  const { impersonatedUserId } = useAdminStore()
  const loadVersion = useRef(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [lessons, setLessons] = useState<VideoLesson[]>([])
  const [plans, setPlans] = useState<QuestionTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'plans' | 'videos'>('plans')
  const [search, setSearch] = useState('')

  const load = useCallback(async (uid: string) => {
    const version = ++loadVersion.current
    setLoading(true); setError('')
    try {
      const [videos, tasks] = await Promise.all([
        fetchCompletedQuestionVideos(uid),
        fetchQuestionPlans(uid),
      ])
      if (version !== loadVersion.current) return
      setLessons(videos)
      setPlans(tasks)
    } catch (failure) { if (version === loadVersion.current) setError(questionPlanError(failure as { code?: string })) }
    finally { if (version === loadVersion.current) setLoading(false) }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadVersion.current++
    setPlans([]); setLessons([]); setUserId(null); setError(''); setLoading(true)
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return
      if (!user) { setLoading(false); return }
      const uid = impersonatedUserId || user.id
      setUserId(uid); void load(uid)
    })
    return () => { cancelled = true; loadVersion.current++ }
  }, [impersonatedUserId, load])

  const saveTarget = async (lesson?: VideoLesson, existing?: QuestionTask) => {
    if (!userId || (!existing && !lesson?.resources?.subject_id)) return
    let selectedDate = existing?.date || localDayKey(new Date())
    const options = questionInputOptions(String(existing?.target_questions || 30))
    const result = await Swal.fire({
      ...options,
      title: existing ? 'Soru hedefini düzenle' : 'Soru hedefi ekle',
      html: options.html + '<label class="question-dialog-date">Çözülecek gün<input id="question-date" type="date" required></label>',
      didOpen: () => {
        options.didOpen()
        const input = Swal.getPopup()?.querySelector<HTMLInputElement>('#question-date')
        if (input) input.value = selectedDate
      },
      showCancelButton: true, confirmButtonText: 'Kaydet', cancelButtonText: 'İptal', confirmButtonColor: '#4269a8',
      showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async value => {
        const target = questionCount(value)
        const dateInput = Swal.getPopup()?.querySelector<HTMLInputElement>('#question-date')
        selectedDate = dateInput?.value || ''
        if (target === null || !dateInput?.checkValidity() || !selectedDate) { Swal.showValidationMessage('Soru sayısını ve günü seçin.'); return false }
        const response = existing
          ? await supabase.from('question_plans').update({ target_questions: target, date: selectedDate }).eq('id', existing.id).eq('user_id', userId).select('id').single()
          : await supabase.from('question_plans').insert({ user_id: userId, video_plan_item_id: lesson!.id, subject_id: lesson!.resources!.subject_id, resource_id: lesson!.resource_id, target_questions: target, date: selectedDate }).select('id').single()
        if (response.error) { Swal.showValidationMessage(response.error.code === '23505' ? 'Bu video için hedef zaten var. Soru hedefleri sekmesinden düzenleyin.' : questionPlanError(response.error)); return false }
        return true
      },
    })
    if (result.isConfirmed) { setTab('plans'); await load(userId) }
  }

  const addSolved = async (plan: QuestionTask) => {
    if (!userId) return
    const entryId = crypto.randomUUID()
    let pendingAnswers: ReturnType<typeof readQuestionAnswers> = null
    const result = await Swal.fire({
      ...questionCompletionOptions(), title: 'Çözülen soru ekle',
      showCancelButton: true, confirmButtonText: 'Ekle', cancelButtonText: 'İptal', confirmButtonColor: '#4269a8',
      showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async value => {
        const answers = pendingAnswers || readQuestionAnswers(value)
        if (!answers || answers.solved_questions < 1) { if (answers) Swal.showValidationMessage('En az 1 soru girin.'); return false }
        pendingAnswers = answers
        lockQuestionInputs()
        const { error: saveError } = await supabase.rpc('add_solved_questions', { p_entry_id: entryId, p_question_plan_id: plan.id, p_questions: answers.solved_questions, p_correct: answers.correct_questions, p_wrong: answers.wrong_questions })
        if (saveError) { Swal.showValidationMessage(questionPlanError(saveError)); return false }
        return true
      },
    })
    if (result.isConfirmed) await load(userId)
  }

  const matches = (name: string) => name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR').trim())
  const visiblePlans = plans.filter(plan => matches(`${plan.subjects?.name || ''} ${plan.resources?.name || ''}`))
  const visibleLessons = lessons.filter(lesson => matches(`${lesson.resources?.subjects?.name || ''} ${lesson.resources?.name || ''}`))
  const solved = plans.reduce((sum, plan) => sum + plan.solved_questions, 0)
  const target = plans.reduce((sum, plan) => sum + (plan.target_questions || 0), 0)
  return <div className="question-page">
    <header className="question-header"><div><p>SORU ÇALIŞMASI</p><h1>Soru planı</h1></div><Link className="question-button" to="/study"><Play size={16} /> Çalışmaya geç</Link></header>
    <div className="question-summary"><span><strong>{solved.toLocaleString('tr-TR')}</strong> soru çözüldü</span><span>{target.toLocaleString('tr-TR')} soru hedefi · {plans.length} plan</span></div>
    <div className="question-toolbar"><div className="question-tabs" role="group" aria-label="Soru planı görünümü"><button aria-pressed={tab === 'plans'} onClick={() => setTab('plans')}>Soru hedefleri <span>{plans.length}</span></button><button aria-pressed={tab === 'videos'} onClick={() => setTab('videos')}>Tamamlanan videolar <span>{lessons.length}</span></button></div><input type="search" aria-label="Ders ara" placeholder="Ders ara…" value={search} onChange={event => setSearch(event.target.value)} /></div>
    {error && <div className="question-error" role="alert"><span>{error}</span><button onClick={() => userId && void load(userId)}><RefreshCw size={16} /> Tekrar dene</button></div>}
    {loading ? <div className="question-empty">Yükleniyor…</div> : !error && (tab === 'plans' ? <div className="question-cards">
      {visiblePlans.length === 0 && <div className="question-empty"><BookOpenCheck size={28} /><p>{search ? 'Aramaya uygun plan yok.' : 'Soru hedefi eklemek için tamamlanan bir video seç.'}</p><button className="question-button" onClick={() => { setSearch(''); setTab('videos') }}>Tamamlanan videolar <ChevronRight size={16} /></button></div>}
      {visiblePlans.map(plan => {
        const done = plan.target_questions != null && plan.solved_questions >= plan.target_questions
        return <article className={`question-card ${done ? 'is-done' : ''}`} key={plan.id}>
          <div className="question-card-top"><span>{dateLabel(plan.date)}{plan.date < localDayKey(new Date()) && !done ? ' · Bekliyor' : ''}</span>{done && <span><Check size={14} /> Tamamlandı</span>}</div>
          <h2>{plan.subjects?.name || 'Ders kaldırıldı'}</h2><p>{plan.resources?.name || 'Ek soru çözümü'}</p>
          <div className="question-count"><strong>{plan.solved_questions}</strong><span>{plan.target_questions ? `/ ${plan.target_questions} soru` : 'soru'}</span></div>
          {plan.target_questions != null && <div className="question-progress" role="progressbar" aria-label="Çözülen sorular" aria-valuenow={Math.min(plan.solved_questions, plan.target_questions)} aria-valuemin={0} aria-valuemax={plan.target_questions}><i style={{ width: `${Math.min(100, plan.solved_questions / plan.target_questions * 100)}%` }} /></div>}
          <div className="question-answers">{plan.answers_recorded && <span>{[plan.correct_recorded ? `${plan.correct_questions} doğru` : '', plan.wrong_recorded ? `${plan.wrong_questions} yanlış` : ''].filter(Boolean).join(' · ')}</span>}</div><div className="question-card-actions"><button className="question-button" onClick={() => void addSolved(plan)}><Plus size={15} /> Çözülen ekle</button><button className="question-edit" onClick={() => void saveTarget(undefined, plan)}>Hedefi düzenle</button></div>
        </article>
      })}
    </div> : <div className="question-lessons">
      {visibleLessons.length === 0 && <div className="question-empty"><BookOpenCheck size={28} /><p>{search ? 'Aramaya uygun video yok.' : 'Videoları izledikçe tamamlanan dersler burada görünecek.'}</p><Link className="question-button" to="/videos">Video planını aç</Link></div>}
      {visibleLessons.map(lesson => {
        const existing = plans.find(plan => plan.video_plan_item_id === lesson.id)
        return <button key={lesson.id} className="question-lesson" disabled={!lesson.resources?.subject_id} onClick={() => void saveTarget(lesson, existing)}><div className="question-lesson-icon"><Check size={20} /></div><div><strong>{lesson.resources?.subjects?.name || 'Ders kaldırıldı'}</strong><span>{lesson.resources?.name} · {dateLabel(lesson.date)} · {lesson.video_count} video</span></div><span className="question-lesson-target">{existing ? `${existing.target_questions} soru` : 'Hedef ekle'}<ChevronRight size={17} /></span></button>
      })}
    </div>)}
  </div>
}
