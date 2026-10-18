import './MonthlyPlan.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { CalendarDays, Check, ChevronLeft, ChevronRight, LockKeyhole, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import Swal from 'sweetalert2'
import { supabase } from '../lib/supabase'
import { fetchMonthlyData } from '../lib/sharedTopicsData'
import { monthKey, monthLabel, shiftMonth, monthlyPayload, monthlyTargetKey, sharedTopicsError, groupMonthlyTargets } from '../lib/monthlyTopics'
import type { MonthlyTopic, MonthlyTarget } from '../lib/monthlyTopics'
import { useAdminStore } from '../lib/adminStore'
import type { AgsTopicSource } from '../lib/agsTopicSource'
import { useMonthlyPlanAccess } from '../lib/useMonthlyPlanAccess'
import { fetchSharedMonthlyPlan, monthlyPlanAccessError } from '../lib/monthlyPlanAccess'

export default function MonthlyPlan() {
  const { plans, loading: accessLoading, error: accessError, revision, refresh: refreshAccess } = useMonthlyPlanAccess()
  const [selectedOwner, setSelectedOwner] = useState('')
  const activePlan = plans.find(plan => plan.plan_owner_id === selectedOwner) || plans[0]
  const ownerId = activePlan?.plan_owner_id || ''
  const canEdit = activePlan?.can_edit === true
  const [loadedOwner, setLoadedOwner] = useState('')
  const [loadingData, setLoadingData] = useState(false)
  const [topics, setTopics] = useState<MonthlyTopic[]>([])
  const [targets, setTargets] = useState<MonthlyTarget[]>([])
  const [agsSource, setAgsSource] = useState<AgsTopicSource | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [start, setStart] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` })
  const [month, setMonth] = useState(start)
  const [subject, setSubject] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const mounted = useRef(false), submitting = useRef(false), version = useRef(0)
  const { impersonatedUserId } = useAdminStore()
  const load = useCallback(async (uid: string, editable: boolean) => {
    const request = ++version.current
    setLoadingData(true)
    try {
      const data = editable ? await fetchMonthlyData(supabase, uid) : await fetchSharedMonthlyPlan(supabase, uid)
      if (!mounted.current || request !== version.current) return
      setTopics(data.topics); setTargets(data.targets); setAgsSource(data.agsTopicSource); setError(''); setLoadedOwner(uid)
      setSubject(previous => data.topics.some(topic => topic.subjectKey === previous && !topic.archived) ? previous : data.topics.find(topic => !topic.archived)?.subjectKey || '')
      setSelected(previous => previous.filter(key => data.topics.some(topic => topic.key === key && !topic.archived)))
    } catch (error) {
      if (mounted.current && request === version.current) {
        setTopics([]); setTargets([]); setLoadedOwner(uid); setError(editable ? sharedTopicsError(error) : monthlyPlanAccessError(error))
      }
    } finally { if (mounted.current && request === version.current) setLoadingData(false) }
  }, [])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; version.current++ }
  }, [])
  useEffect(() => {
    if (!ownerId) { version.current++; return }
    if (!submitting.current) void load(ownerId, canEdit)
  }, [ownerId, canEdit, revision, load])
  useEffect(() => {
    if (!ownerId) return
    const refresh = (event: Event) => { if (!submitting.current && event instanceof CustomEvent && event.detail?.userId === ownerId) void load(ownerId, canEdit) }
    window.addEventListener('ags-topic-source-changed', refresh)
    return () => { window.removeEventListener('ags-topic-source-changed', refresh) }
  }, [ownerId, canEdit, load])
  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => shiftMonth(start, index)).filter(value => monthKey(value)), [start])
  const subjectOptions = [...new Map(topics.filter(topic => !topic.archived).map(topic => [topic.subjectKey, { key: topic.subjectKey, label: `${topic.exam} · ${topic.subject}` }])).values()]
  const choices = topics.filter(topic => !topic.archived && topic.subjectKey === subject && topic.title.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')))
  const assigned = new Map(targets.map(target => [monthlyTargetKey(target), target]))
  const groups = groupMonthlyTargets(topics, targets, month)
  const targetCount = groups.reduce((total, group) => total + group.items.length, 0)
  const save = async (items: ReturnType<typeof monthlyPayload>) => {
    if (!canEdit || submitting.current) return
    submitting.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const { data, error } = await supabase.rpc('save_monthly_topic_targets', { p_items: items })
      if (error) throw error
      if (!data || data.saved !== items.length) throw new Error('Kayıt doğrulanamadı')
      if (!mounted.current) return
      setSelected([]); setNote(''); setMessage(`${items.length} konu ${monthLabel(items[0].month)} ayına planlandı.`)
      await load(ownerId, canEdit)
    } catch (error) { if (mounted.current) setError(sharedTopicsError(error)) }
    finally { submitting.current = false; if (mounted.current) setBusy(false) }
  }
  const assign = () => {
    try { void save(monthlyPayload(topics, selected, month, note)) } catch (error) { setError((error as Error).message) }
  }
  const move = async (target: MonthlyTarget, topic?: MonthlyTopic) => {
    if (!canEdit || !topic || topic.archived || busy) return
    const result = await Swal.fire({ title: 'Bitiş ayını değiştir', input: 'month', inputValue: target.target_month.slice(0, 7), inputAttributes: { min: '2000-01', max: '2100-12' }, showCancelButton: true, confirmButtonText: 'Taşı', cancelButtonText: 'Vazgeç', confirmButtonColor: '#4269a8', inputValidator: value => monthKey(value) ? undefined : 'Geçerli bir ay seç.' })
    if (result.isConfirmed && mounted.current) await save(monthlyPayload(topics, [topic.key], result.value, target.note || ''))
  }
  const remove = async (target: MonthlyTarget) => {
    if (!canEdit) return
    const result = await Swal.fire({ title: 'Aylık plandan kaldırılsın mı?', text: 'Konu ve tamamlanma durumun korunur.', icon: 'question', showCancelButton: true, confirmButtonText: 'Plandan kaldır', cancelButtonText: 'Vazgeç', confirmButtonColor: '#b94646' })
    if (!result.isConfirmed || !mounted.current || submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    try {
      const { error } = await supabase.rpc('remove_monthly_topic_target', { p_target_id: target.id })
      if (error) throw error
      if (mounted.current) { setMessage('Konu aylık plandan kaldırıldı.'); await load(ownerId, canEdit) }
    } catch (error) { if (mounted.current) setError(sharedTopicsError(error)) }
    finally { submitting.current = false; if (mounted.current) setBusy(false) }
  }
  if (accessLoading) return <p className="monthly-muted p-5">Aylık plan erişimi kontrol ediliyor…</p>
  if (accessError) return <div role="alert" className="monthly-error">{accessError}<button type="button" className="monthly-button" onClick={refreshAccess}><RefreshCw size={14} /> Tekrar dene</button></div>
  if (!activePlan) return <Navigate to="/" replace />
  if (loadedOwner !== ownerId) return <p className="monthly-muted p-5">Aylık plan yükleniyor…</p>
  return <div className="monthly-page">
    <header className="monthly-heading"><div><p className="monthly-eyebrow">{canEdit ? 'AYLIK HEDEFLERİN' : <><LockKeyhole size={12} /> SALT OKUNUR</>}</p><h1><CalendarDays size={24} /> Aylık plan</h1><p>{canEdit ? 'Hangi dersin hangi konusu, hangi ay bitecek?' : `${activePlan.owner_name} tarafından paylaşılan aylık hedefler.`}</p>{canEdit && impersonatedUserId && <p>Bu plan kendi admin hesabına aittir.</p>}</div>{canEdit && <Link to="/topics" className="monthly-button">Konu listesine git</Link>}</header>
    {plans.length > 1 && <label className="monthly-owner-select">Görüntülenen plan<select value={ownerId} disabled={busy} onChange={event => { setSelectedOwner(event.target.value); setSelected([]); setNote(''); setMessage('') }}>{plans.map(plan => <option key={plan.plan_owner_id} value={plan.plan_owner_id}>{plan.can_edit ? 'Kendi aylık planım' : `${plan.owner_name} · Paylaşılan plan`}</option>)}</select></label>}
    {error && <div className="monthly-error" role="alert">{error}<button type="button" className="monthly-button" disabled={busy || loadingData} onClick={() => void load(ownerId, canEdit)}><RefreshCw size={14} /> Tekrar dene</button></div>}
    {canEdit && !error && !agsSource && <p className="monthly-source-notice">AGS konularını planlamak için önce <Link to="/topics">Konu Takibi’nden AGS listeni seç</Link>.</p>}
    <div className={`monthly-layout ${canEdit ? '' : 'is-readonly'}`}>
      {canEdit && <section className="monthly-planner" aria-label="Ders ve konu planla" aria-busy={busy}><h2>Konu planla</h2><label>Ders<select value={subject} disabled={busy || !!error} onChange={event => { setSubject(event.target.value); setSelected([]); setSearch(''); setMessage('') }}><option value="">Ders seç</option>{subjectOptions.map(row => <option key={row.key} value={row.key}>{row.label}</option>)}</select></label><label>Bitiş ayı<input type="month" min="2000-01" max="2100-12" value={month} disabled={busy} onChange={event => { if (monthKey(event.target.value)) setMonth(event.target.value) }} /></label>
        <div className="monthly-topic-picker"><div><strong>Konular</strong><button type="button" disabled={!choices.length || busy} onClick={() => setSelected(choices.every(topic => selected.includes(topic.key)) ? [] : choices.map(topic => topic.key))}>{choices.length && choices.every(topic => selected.includes(topic.key)) ? 'Seçimi temizle' : 'Tümünü seç'}</button></div><input type="search" aria-label="Konu ara" placeholder="Konu ara…" value={search} onChange={event => setSearch(event.target.value)} /><div className="monthly-topic-options">{!choices.length && <p className="monthly-muted">Bu derste seçilebilir konu yok. Konu Takibi’nden başlık ekleyebilirsin.</p>}{choices.map(topic => <label key={topic.key}><input type="checkbox" checked={selected.includes(topic.key)} disabled={busy} onChange={event => setSelected(previous => event.target.checked ? [...previous, topic.key] : previous.filter(key => key !== topic.key))} /><span>{topic.title}{assigned.has(topic.key) && <small>Planlı: {monthLabel(assigned.get(topic.key)!.target_month)}</small>}</span></label>)}</div></div>
        <label>Not <span>(isteğe bağlı)</span><textarea rows={2} maxLength={1000} disabled={busy} value={note} onChange={event => setNote(event.target.value)} placeholder="Örn. Konu + tekrar + branş denemesi" /></label><button type="button" className="monthly-button is-primary" disabled={busy || !!error || !selected.length} onClick={assign}><Plus size={16} />{busy ? 'Kaydediliyor…' : `${selected.length} konuyu planla`}</button><p className="monthly-muted">Önceden planlanan konu seçersen bitiş ayı güncellenir.</p>{message && <p role="status" className="monthly-success">{message}</p>}
      </section>}
      <section className="monthly-calendar" aria-label="Aylık konu takvimi" aria-busy={loadingData}><div className="monthly-calendar-toolbar"><h2>Aylar ve bitiş hedefleri</h2><div><button type="button" className="monthly-icon" aria-label="Önceki aydan başlat" disabled={start <= '2000-01'} onClick={() => setStart(shiftMonth(start, -1))}><ChevronLeft size={17} /></button><input type="month" min="2000-01" max="2100-12" aria-label="Takvim başlangıcı" value={start} onChange={event => { if (monthKey(event.target.value)) setStart(event.target.value) }} /><button type="button" className="monthly-icon" aria-label="Sonraki aydan başlat" disabled={start >= '2100-12'} onClick={() => setStart(shiftMonth(start, 1))}><ChevronRight size={17} /></button></div></div>
        <div className="monthly-months">{months.map(value => { const count = targets.filter(target => target.target_month.slice(0, 7) === value).length; return <button type="button" key={value} aria-pressed={month === value} onClick={() => setMonth(value)}><span>{monthLabel(value)}</span><strong>{count}<small>konu</small></strong></button> })}</div>
        <div className="monthly-selected-month"><header><h2>{monthLabel(month)}</h2><span>{groups.length} ders · {targetCount} konu</span></header>{!targetCount && !error && <p className="monthly-empty">Bu aya henüz konu planlanmamış.</p>}{groups.map(group => <section className="monthly-course-group" key={group.key} aria-label={`${group.exam} ${group.subject}`}><header><div><span>{group.exam}</span><h3>{group.subject}</h3></div><strong>{group.items.length} konu</strong></header><div>{group.items.map(({ target, topic }, index) => <article key={target.id}>{canEdit ? <span className={`monthly-status-dot ${topic?.completed ? 'is-done' : ''}`}>{topic?.completed && <Check size={12} />}</span> : <span className="monthly-topic-number">{index + 1}</span>}<div><h4>{topic?.title || 'Konu kaldırıldı'}</h4>{topic?.archived && <span className="monthly-archived">Ortak listede arşivlendi</span>}{target.note && <p>{target.note}</p>}</div>{canEdit && <><button type="button" className="monthly-icon" disabled={busy || !topic || topic.archived} aria-label={`${topic?.title || 'Konu'} için bitiş ayını değiştir`} onClick={() => void move(target, topic)}><Pencil size={15} /></button><button type="button" className="monthly-icon is-danger" disabled={busy} aria-label={`${topic?.title || 'Konu'} için aylık hedefi kaldır`} onClick={() => void remove(target)}><Trash2 size={15} /></button></>}</article>)}</div></section>)}</div>
      </section>
    </div>
  </div>
}
