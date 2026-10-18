import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Save } from 'lucide-react'
import type { QuestionPlan } from '../lib/questionPlan'
import { QUESTION_PRESETS } from '../lib/questionPlan'
import { questionWeekDays, weekTargetPayload, questionWeekError, isQuestionTarget } from '../lib/questionWeek'
import { supabase } from '../lib/supabase'

export interface QuestionSubject { id: string; name: string; exam_id: string; exams: { name: string } | null }
interface Props { userId: string; week: string; plans: QuestionPlan[]; subjects: QuestionSubject[]; onSaved: () => void }

export default function QuestionWeekPlanner({ userId, week, plans, subjects, onSaved }: Props) {
  const [subject, setSubject] = useState(subjects[0]?.id || '')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const mounted = useRef(false)
  const submitting = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const days = useMemo(() => questionWeekDays(week), [week])
  const values = Object.fromEntries(days.map(day => {
    const existing = plans.find(plan => isQuestionTarget(plan) && plan.subject_id === subject && plan.kind !== 'video' && !plan.video_plan_item_id && plan.period !== 'week' && plan.date === day.date)
    return [day.date, draft[`${subject}:${day.date}`] ?? String(existing?.target_questions || '')]
  }))
  const edit = (date: string, value: string) => { if (!/^\d*$/.test(value)) return; setDraft(previous => ({ ...previous, [`${subject}:${date}`]: value })); setSaved(false); setError('') }
  const save = async () => {
    if (submitting.current || !subject) return
    setError(''); setSaved(false)
    let targets: ReturnType<typeof weekTargetPayload>
    try { targets = weekTargetPayload(week, values) } catch (error) { setError((error as Error).message); return }
    submitting.current = true; setBusy(true)
    try {
      const { data, error } = await supabase.rpc('save_question_week_targets', { p_user_id: userId, p_subject_id: subject, p_week_start: week, p_targets: targets })
      if (!mounted.current) return
      if (error) { setError(questionWeekError(error)); return }
      if (!data || data.saved !== targets.length) { setError('Kayıt doğrulanamadı. Aynı hedefleri tekrar kaydetmek soru sayısını artırmaz.'); return }
      setSaved(true); onSaved()
    } catch { if (mounted.current) setError('Bağlantı kurulamadı. Aynı hedeflerle tekrar deneyebilirsin.') }
    finally { submitting.current = false; if (mounted.current) setBusy(false) }
  }
  return <section className="question-week-planner" aria-label="Günlere dağıtarak soru planla" aria-busy={busy}>
    <header><div><h2>Haftayı günlere dağıt</h2><p>Bir ders seç, çalışacağın günlere soru hedefi yaz.</p></div><label>Ders<select value={subject} onChange={event => { setSubject(event.target.value); setError(''); setSaved(false) }} disabled={busy}>{subjects.map(row => <option key={row.id} value={row.id}>{row.exams?.name} · {row.name}</option>)}</select></label></header>
    <fieldset disabled={busy} className="question-week-inputs">{days.map(day => <div className="question-week-field" key={day.date}><label htmlFor={`question-week-${day.date}`}><span>{day.short} <small>{day.day}</small></span><input id={`question-week-${day.date}`} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={values[day.date]} placeholder="—" aria-label={`${day.label} soru hedefi`} onChange={event => edit(day.date, event.target.value)} /></label><div>{QUESTION_PRESETS.map(count => <button type="button" key={count} aria-label={`${day.label} ${count} soru`} aria-pressed={values[day.date] === String(count)} onClick={() => edit(day.date, String(count))}>{count}</button>)}</div></div>)}</fieldset>
    <footer><div><strong>{days.reduce((total, day) => total + (Number(values[day.date]) || 0), 0).toLocaleString('tr-TR')} soru</strong><p>Dersin günlük hedefleri güncellenir; boş bıraktığın günler ve video hedefleri korunur.</p></div><button type="button" className="question-button" disabled={busy || !subject} onClick={() => void save()}>{saved ? <Check size={16} /> : <Save size={16} />}{busy ? 'Kaydediliyor…' : saved ? 'Kaydedildi' : 'Günlere kaydet'}</button></footer>
    {error && <p className="question-panel-error" role="alert">{error}</p>}
    {saved && <p role="status" className="question-panel-success">Hedefler günlere eklendi. Planım sekmesinde görebilirsin.</p>}
  </section>
}
