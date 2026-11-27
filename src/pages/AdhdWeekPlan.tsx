import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Swal from 'sweetalert2'
import {
  ArrowDown, ArrowUp, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCopy, ClipboardPaste, Copy, Eraser,
  Layers, ListChecks, Plus, Save, Sparkles, Trash2, UserRound,
} from 'lucide-react'
import { supabase, getCurrentUser } from '../lib/supabase'
import { useAdminStore } from '../lib/adminStore'
import { localDayKey, mondayOf } from '../lib/statsPeriod'
import { findWeeklyPlans } from '../lib/weeklyPlanDates'
import { isAgsExam } from '../lib/agsTopicSource'
import { profileNameLabel } from '../lib/profileName'
import {
  adhdError, deleteAdhdSet, deleteAdhdTask, deleteAdhdTasks, insertAdhdTasks, minutesLabel, moveAdhdTask,
  addQuestionItem, advanceAdhdTopics, deleteQuestionItem, questionItemsError, readQuestionItems,
  readAdhdSets, readAdhdSettings, readAdhdWeek, readTakenTopics, readTopicCatalog, saveAdhdSet, setAdhdEnabled, setAdhdTopicDone, setsError,
} from '../lib/adhdMode'
import type { AdhdPlanSet, AdhdQuestionItem, AdhdTask } from '../lib/adhdMode'
import { buildIdealWeek, nextTopic, planItemsToTemplate, questionItemsToTemplate, subjectIndex, tasksToTemplate, templateToRows, topicKey, weekDayKeys } from '../lib/adhdPlan'
import type { NamedSubject, TemplateItem, TopicCatalog } from '../lib/adhdPlan'
import './Plan.css'
import './Admin.css'
import './AdhdWeekPlan.css'

interface Profile { id: string; display_name: string | null; email: string | null; role: string | null }
interface Clipboard { label: string; scope: 'day' | 'week'; items: TemplateItem[] }

const dayNames = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const dayShort = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const formatTR = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
const shiftWeek = (monday: string, weeks: number) => {
  const [y, m, d] = monday.split('-').map(Number)
  return localDayKey(new Date(y, m - 1, d + weeks * 7, 12))
}
const plannedOnly = (list: AdhdTask[]) => list.filter(task => !task.is_extra)
const todayDay = () => { const day = new Date().getDay(); return day === 0 ? 7 : day }
const CLIPBOARD_KEY = 'adhd-plan-clipboard'

/** Mevcut derslerin yanına mı eklensin, yerine mi geçsin? */
async function askMode(existing: number, where: string): Promise<'add' | 'replace' | null> {
  if (!existing) return 'add'
  const result = await Swal.fire({
    title: `${where} zaten ${existing} ders var`, text: 'Yeni dersler mevcut derslerin yanına eklensin mi, yoksa mevcutların yerine mi geçsin?',
    icon: 'question', showDenyButton: true, showCancelButton: true,
    confirmButtonText: 'Yanına ekle', denyButtonText: 'Yerine koy', cancelButtonText: 'İptal',
    confirmButtonColor: '#4269a8', denyButtonColor: '#b6454e', cancelButtonColor: '#94a3b8',
  })
  return result.isConfirmed ? 'add' : result.isDenied ? 'replace' : null
}

export default function AdhdWeekPlan() {
  const { isAdmin } = useAdminStore()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [adminId, setAdminId] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [adhdSettings, setAdhdSettingsState] = useState<Record<string, boolean>>({})
  const userId = params.get('user') || ''
  const [monday, setMonday] = useState(() => localDayKey(mondayOf(new Date())))
  const [selectedDay, setSelectedDay] = useState(todayDay)
  const [subjects, setSubjects] = useState<NamedSubject[]>([])
  const [tasks, setTasks] = useState<AdhdTask[]>([])
  const [sets, setSets] = useState<AdhdPlanSet[]>([])
  const [setsProblem, setSetsProblem] = useState('')
  const [clipboard, setClipboard] = useState<Clipboard | null>(() => { try { return JSON.parse(sessionStorage.getItem(CLIPBOARD_KEY) || 'null') } catch { return null } })
  const [subjectId, setSubjectId] = useState('')
  const [catalog, setCatalog] = useState<TopicCatalog>(new Map())
  const [examDate, setExamDate] = useState<string | null>(null)
  const [questionItems, setQuestionItems] = useState<AdhdQuestionItem[]>([])
  const [questionsProblem, setQuestionsProblem] = useState('')
  const [questionLabel, setQuestionLabel] = useState('')
  const [questionDays, setQuestionDays] = useState<number[]>([])
  const [catalogProblem, setCatalogProblem] = useState('')
  const [taken, setTaken] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [setName, setSetName] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const dayKeys = useMemo(() => weekDayKeys(monday), [monday])
  const selectedKey = dayKeys[selectedDay - 1]
  const dayTasks = tasks.filter(task => task.task_date === selectedKey)
  const index = useMemo(() => subjectIndex(subjects), [subjects])
  const selectedProfile = profiles.find(profile => profile.id === userId) || null
  const users = profiles.filter(profile => profile.role !== 'admin')
  const takenFrom = [localDayKey(new Date()), dayKeys[0]].sort()[0]
  const subjectTopics = catalog.get(subjectId) || []
  const suggested = nextTopic(subjectTopics, taken)

  useEffect(() => { if (!isAdmin) navigate('/') }, [isAdmin, navigate])
  useEffect(() => { try { sessionStorage.setItem(CLIPBOARD_KEY, JSON.stringify(clipboard)) } catch { /* optional */ } }, [clipboard])

  // Kişiler ve DEHB ayarları
  useEffect(() => {
    if (!isAdmin) return
    void getCurrentUser().then(({ data: { user } }) => setAdminId(user?.id ?? null))
    void supabase.from('profiles').select('id,display_name,email,role').order('display_name').then(({ data }) => setProfiles((data || []) as Profile[]))
    void readAdhdSettings().then(setAdhdSettingsState, () => setAdhdSettingsState({}))
  }, [isAdmin])

  // URL'de kişi yoksa DEHB modu açık ilk kişiyi seç.
  useEffect(() => {
    if (userId || !users.length) return
    const first = users.find(profile => adhdSettings[profile.id]) || users[0]
    setParams({ user: first.id }, { replace: true })
  }, [userId, users, adhdSettings, setParams])

  // Seçilen kişinin dersleri
  useEffect(() => {
    if (!userId) return
    let active = true
    setSubjects([]); setSubjectId(''); setCatalog(new Map()); setCatalogProblem('')
    void supabase.from('subjects').select('id,name,exams(name,base_template_key,exam_date)').eq('user_id', userId).order('name').then(({ data }) => {
      if (!active) return
      const raw = (data || []) as unknown as { id: string; name: string; exams?: { name?: string; base_template_key?: string | null; exam_date?: string | null } | null }[]
      const rows = raw.map(row => ({ id: row.id, name: row.name, ags: isAgsExam(row.exams || undefined) }))
      setExamDate(raw.find(row => isAgsExam(row.exams || undefined) && row.exams?.exam_date)?.exams?.exam_date ?? null)
      setSubjects(rows)
      const preferred = rows.filter(row => row.ags)
      setSubjectId((preferred.length ? preferred : rows)[0]?.id || '')
      void readTopicCatalog(userId, rows).then(next => { if (active) setCatalog(next) }, () => { if (active) setCatalogProblem('Ortak AGS konuları yüklenemedi; dersler konusuz eklenecek.') })
    })
    return () => { active = false }
  }, [userId])

  const loadWeek = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      // Sistem konuları kendisi planlar: bitenler düşer, başlanmamış dersler sıradaki konulara kayar.
      await advanceAdhdTopics(userId)
      const [week, planned] = await Promise.all([readAdhdWeek(userId, dayKeys[0], dayKeys[6]), readTakenTopics(userId, takenFrom)])
      setTasks(week); setTaken(planned)
    }
    catch (error) { setMessage({ tone: 'error', text: adhdError(error) }) }
    finally { setLoading(false) }
  }, [userId, dayKeys, takenFrom])

  const reloadCatalog = useCallback(async () => {
    if (!userId || !subjects.length) return
    try { setCatalog(await readTopicCatalog(userId, subjects)) } catch { /* son bilinen liste kalır */ }
  }, [userId, subjects])
  useEffect(() => { void loadWeek() }, [loadWeek])

  const loadSets = useCallback(async () => {
    try { setSets(await readAdhdSets()); setSetsProblem('') } catch (error) { setSetsProblem(setsError(error)) }
  }, [])
  useEffect(() => { if (isAdmin) void loadSets() }, [isAdmin, loadSets])

  const loadQuestions = useCallback(async () => {
    try { setQuestionItems(await readQuestionItems()); setQuestionsProblem('') } catch (error) { setQuestionsProblem(questionItemsError(error)) }
  }, [])
  useEffect(() => { if (isAdmin) void loadQuestions() }, [isAdmin, loadQuestions])

  const run = async (action: () => Promise<string | void>) => {
    if (busy) return
    setBusy(true); setMessage(null)
    try {
      const text = await action()
      if (text) setMessage({ tone: 'ok', text })
      await loadWeek()
    } catch (error) { setMessage({ tone: 'error', text: error instanceof Error && 'friendly' in error ? error.message : adhdError(error) }) }
    finally { setBusy(false) }
  }

  /** Şablonu bu kişiye uygular: gün için targetDay verilir, aksi halde haftaya. */
  const applyTemplate = (items: TemplateItem[], label: string, targetDay?: number) => run(async () => {
    if (!items.length) return 'Uygulanacak ders yok.'
    const targetTasks = targetDay ? tasks.filter(task => task.task_date === dayKeys[targetDay - 1]) : tasks
    const mode = await askMode(targetTasks.length, targetDay ? `${dayNames[targetDay - 1]} gününde` : 'Bu haftada')
    if (!mode) return
    const existing: Record<string, number> = {}
    if (mode === 'add') for (const task of targetTasks) existing[task.task_date] = (existing[task.task_date] ?? 0) + 1
    const replaced = mode === 'replace' ? targetTasks.map(task => task.id) : []
    // Konular sıradakinden ilerler; yerine konacak derslerin konuları yeniden kullanılabilir.
    const planned = await readTakenTopics(userId, takenFrom, replaced)
    const { rows, missing } = templateToRows(items, { userId, dayKeys, subjects: index, existing, targetDay, catalog, taken: planned })
    if (!rows.length) return `Hiçbir ders eşleşmedi. Bu kişide şu dersler yok: ${missing.join(', ')}`
    if (replaced.length) await deleteAdhdTasks(replaced)
    await insertAdhdTasks(rows)
    const withTopic = rows.filter(row => row.topic_id).length
    return `${label}: ${rows.length} ders eklendi${withTopic ? `, ${withTopic} tanesine sıradaki konu atandı` : ''}.${missing.length ? ` Bu kişide olmadığı için atlananlar: ${missing.join(', ')}.` : ''}`
  })

  const add = (event: FormEvent) => {
    event.preventDefault()
    if (!subjectId) return
    void run(async () => {
      const topic = suggested
      await insertAdhdTasks([{
        user_id: userId, task_date: selectedKey, subject_id: subjectId, note: note.trim() || null, sort_order: dayTasks.length,
        topic_kind: topic?.kind ?? null, topic_id: topic?.id ?? null, topic_title: topic?.title ?? null,
      }])
      setNote('')
    })
  }

  const copyDay = () => {
    const items = tasksToTemplate(plannedOnly(dayTasks), dayKeys)
    if (!items.length) { setMessage({ tone: 'error', text: 'Bu gün boş, kopyalanacak ders yok.' }); return }
    setClipboard({ scope: 'day', items, label: `${profileNameLabel(selectedProfile?.display_name, selectedProfile?.email)} · ${dayNames[selectedDay - 1]} (${items.length} ders)` })
    setMessage({ tone: 'ok', text: 'Gün kopyalandı. İstediğin güne veya kişiye yapıştırabilirsin.' })
  }
  const copyWeek = () => {
    const items = tasksToTemplate(plannedOnly(tasks), dayKeys)
    if (!items.length) { setMessage({ tone: 'error', text: 'Bu hafta boş, kopyalanacak ders yok.' }); return }
    setClipboard({ scope: 'week', items, label: `${profileNameLabel(selectedProfile?.display_name, selectedProfile?.email)} · ${formatTR(dayKeys[0])} haftası (${items.length} ders)` })
    setMessage({ tone: 'ok', text: 'Hafta kopyalandı. İstediğin haftaya veya kişiye yapıştırabilirsin.' })
  }

  /** Admin'in kendi Haftalık Plan sayfasındaki maddeleri panoya alır. */
  const copyFromMyPlan = async (scope: 'day' | 'week') => {
    if (!adminId || busy) return
    setBusy(true); setMessage(null)
    try {
      const { data: plans, error } = await findWeeklyPlans(supabase, adminId, new Date(`${dayKeys[0]}T12:00:00`))
      if (error) throw error
      if (!plans?.length) { setMessage({ tone: 'error', text: 'Kendi planında bu hafta için plan bulunamadı.' }); return }
      const [{ data: items, error: itemError }, { data: mySubjects, error: subjectError }] = await Promise.all([
        supabase.from('plan_items').select('day_of_week,subject_id,title,sort_order').in('weekly_plan_id', plans.map(plan => plan.id)),
        supabase.from('subjects').select('id,name').eq('user_id', adminId),
      ])
      if (itemError || subjectError) throw itemError || subjectError
      const names = Object.fromEntries((mySubjects || []).map(subject => [subject.id, subject.name]))
      const filtered = (items || []).filter(item => scope === 'week' || item.day_of_week === selectedDay)
      const { items: template, skipped } = planItemsToTemplate(filtered, names)
      if (!template.length) { setMessage({ tone: 'error', text: scope === 'day' ? 'Kendi planında bu gün için dersli madde yok.' : 'Kendi planında bu hafta dersli madde yok.' }); return }
      setClipboard({ scope, items: template, label: `Kendi planım · ${scope === 'day' ? dayNames[selectedDay - 1] : `${formatTR(dayKeys[0])} haftası`} (${template.length} ders)` })
      setMessage({ tone: 'ok', text: `Kendi planından ${template.length} ders kopyalandı.${skipped ? ` Dersi seçilmemiş ${skipped} madde atlandı.` : ''} Şimdi “Yapıştır”a bas.` })
    } catch (error) { setMessage({ tone: 'error', text: adhdError(error) }) }
    finally { setBusy(false) }
  }

  const paste = () => {
    if (!clipboard) return
    void applyTemplate(clipboard.items, 'Yapıştırıldı', clipboard.scope === 'day' ? selectedDay : undefined)
  }

  const copyPreviousWeek = async () => {
    const previous = weekDayKeys(shiftWeek(monday, -1))
    let items: TemplateItem[]
    try { items = tasksToTemplate(plannedOnly(await readAdhdWeek(userId, previous[0], previous[6])), previous) }
    catch (error) { setMessage({ tone: 'error', text: adhdError(error) }); return }
    if (!items.length) { setMessage({ tone: 'error', text: 'Geçen hafta bu kişi için plan yok.' }); return }
    await applyTemplate(items, 'Geçen hafta kopyalandı')
  }

  const clearWeek = async () => {
    if (!tasks.length) return
    const result = await Swal.fire({ title: 'Haftayı temizle', text: `Bu haftadaki ${tasks.length} ders silinecek.`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Evet, temizle', cancelButtonText: 'İptal', confirmButtonColor: '#b6454e', cancelButtonColor: '#94a3b8' })
    if (result.isConfirmed) void run(async () => { await deleteAdhdTasks(tasks.map(task => task.id)); return 'Hafta temizlendi.' })
  }

  const saveSet = (event: FormEvent) => {
    event.preventDefault()
    // Setler konu tutmaz: her uygulandığında dersler sıradaki konuyla ilerler.
    const items = tasksToTemplate(plannedOnly(tasks), dayKeys, false)
    if (!setName.trim()) return
    if (!items.length) { setMessage({ tone: 'error', text: 'Set kaydetmek için önce bu haftaya ders ekle.' }); return }
    void run(async () => {
      try { await saveAdhdSet(setName, items) } catch (error) { throw Object.assign(new Error(setsError(error)), { friendly: true }) }
      setSetName(''); await loadSets()
      return `“${setName.trim()}” seti kaydedildi (${items.length} ders).`
    })
  }

  const addQuestion = (event: FormEvent) => {
    event.preventDefault()
    const label = questionLabel.trim()
    if (!label || !questionDays.length) return
    void run(async () => {
      try { await addQuestionItem(label, questionDays, questionItems.length) } catch (error) { throw Object.assign(new Error(questionItemsError(error)), { friendly: true }) }
      setQuestionLabel(''); setQuestionDays([]); await loadQuestions()
      return `“${label}” hazır sete soru çözümü olarak eklendi.`
    })
  }
  const removeQuestion = (id: string) => run(async () => {
    try { await deleteQuestionItem(id) } catch (error) { throw Object.assign(new Error(questionItemsError(error)), { friendly: true }) }
    await loadQuestions()
    return 'Soru çözümü hazır setten çıkarıldı.'
  })

  const removeSet = async (set: AdhdPlanSet) => {
    const result = await Swal.fire({ title: 'Seti sil', text: `“${set.name}” seti silinsin mi? Daha önce uygulanmış planlar etkilenmez.`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Sil', cancelButtonText: 'İptal', confirmButtonColor: '#b6454e', cancelButtonColor: '#94a3b8' })
    if (result.isConfirmed) void run(async () => { await deleteAdhdSet(set.id); await loadSets(); return 'Set silindi.' })
  }

  const toggleTopic = (task: AdhdTask) => run(async () => {
    await setAdhdTopicDone(task.id, !task.topic_completed_at)
    await reloadCatalog()
    return task.topic_completed_at ? `“${task.topic_title}” tekrar açıldı.` : `“${task.topic_title}” bitti olarak işaretlendi.`
  })

  const toggleMode = () => run(async () => {
    const next = !adhdSettings[userId]
    await setAdhdEnabled(userId, next)
    setAdhdSettingsState(previous => ({ ...previous, [userId]: next }))
    return next ? 'DEHB modu açıldı.' : 'DEHB modu kapatıldı.'
  })

  if (!isAdmin) return null
  // Ortak AGS konularında kişinin ilerlemesi (tamamlananlar tik ile).
  // Hazır ideal set: sınava kalan haftaya ve bitmemiş ortak konulara göre her seferinde yeniden hesaplanır.
  const idealLessons = buildIdealWeek([...catalog.entries()].map(([id, list]) => ({ name: subjects.find(subject => subject.id === id)?.name || '', remaining: list.filter(topic => !topic.completed).length })).filter(row => row.name), dayKeys[0], examDate)
  const ideal = idealLessons
  const idealItems = [...ideal.items, ...questionItemsToTemplate(questionItems)]
  const progress = [...catalog.entries()].map(([id, list]) => ({ id, name: subjects.find(subject => subject.id === id)?.name || 'Ders', topics: list }))
  const totalTopics = progress.reduce((sum, row) => sum + row.topics.length, 0)
  const doneTopics = progress.reduce((sum, row) => sum + row.topics.filter(topic => topic.completed).length, 0)
  const agsSubjects = subjects.filter(subject => subject.ags)
  const subjectOptions = agsSubjects.length ? agsSubjects : subjects

  return (
    <div className="weekly-plan adhd-plan-page">
      <header className="plan-header">
        <div><p className="plan-eyebrow">DEHB MODU</p><h1>DEHB Haftalık Plan</h1><p>Kişiye gün gün ders ve konu ekle; kendi planından kopyala veya kayıtlı bir seti uygula. Konular sırayla ilerler.</p></div>
        <div className="plan-actions"><button type="button" onClick={() => navigate('/admin')}><UserRound size={16} />Admin paneli</button></div>
      </header>

      <section className="adhd-plan-person" aria-label="Kişi seçimi">
        <label>Kişi
          <select aria-label="Kişi" value={userId} onChange={event => setParams({ user: event.target.value })}>
            {users.map(profile => <option key={profile.id} value={profile.id}>{profileNameLabel(profile.display_name, profile.email)}{adhdSettings[profile.id] ? ' · DEHB modu açık' : ''}</option>)}
          </select>
        </label>
        {userId && <button type="button" role="switch" aria-checked={Boolean(adhdSettings[userId])} onClick={() => void toggleMode()} disabled={busy} className={`adhd-admin-switch ${adhdSettings[userId] ? 'is-on' : ''}`}>
          <span className="adhd-admin-switch-track" aria-hidden="true"><span /></span>
          <span><strong>{adhdSettings[userId] ? 'DEHB modu açık' : 'DEHB modu kapalı'}</strong><small>Açıkken kişi yalnızca o günün derslerini görür.</small></span>
        </button>}
      </section>

      <section className="plan-week-picker" aria-label="Hafta seçimi">
        <button type="button" onClick={() => setMonday(shiftWeek(monday, -1))} aria-label="Önceki hafta"><ChevronLeft size={18} /></button>
        <div><span>SEÇİLİ HAFTA</span><strong>{formatTR(dayKeys[0])} — {formatTR(dayKeys[6])}</strong></div>
        <button type="button" onClick={() => setMonday(shiftWeek(monday, 1))} aria-label="Sonraki hafta"><ChevronRight size={18} /></button>
      </section>

      <div className="plan-days" role="tablist" aria-label="Haftanın günleri">
        {dayShort.map((short, i) => {
          const key = dayKeys[i], list = tasks.filter(task => task.task_date === key), done = list.filter(task => task.completed_at).length
          return <button type="button" key={short} role="tab" id={`adhd-tab-${i + 1}`} aria-selected={selectedDay === i + 1} aria-controls="adhd-day-content" onClick={() => setSelectedDay(i + 1)} className={selectedDay === i + 1 ? 'is-active' : ''}>
            <span className="plan-day-name">{short}</span><strong>{Number(key.slice(8))}</strong><span>{list.length ? `${list.length} ders` : 'Plan yok'}</span><small>{list.length ? `${done} yapıldı` : '—'}</small>
          </button>
        })}
      </div>

      <div className="adhd-plan-toolbar" role="toolbar" aria-label="Kopyala ve yapıştır">
        <button type="button" onClick={copyDay} disabled={busy}><ClipboardCopy size={16} />Günü kopyala</button>
        <button type="button" onClick={copyWeek} disabled={busy}><Copy size={16} />Haftayı kopyala</button>
        <button type="button" onClick={() => void copyFromMyPlan('day')} disabled={busy || !adminId}><ClipboardCopy size={16} />Kendi planımdan: bu gün</button>
        <button type="button" onClick={() => void copyFromMyPlan('week')} disabled={busy || !adminId}><Copy size={16} />Kendi planımdan: bu hafta</button>
        <button type="button" onClick={() => void copyPreviousWeek()} disabled={busy}><Copy size={16} />Geçen haftayı kopyala</button>
        <button type="button" onClick={() => void clearWeek()} disabled={busy || !tasks.length} className="is-danger"><Eraser size={16} />Haftayı temizle</button>
      </div>

      {clipboard && <div className="adhd-plan-clipboard">
        <span><ClipboardPaste size={16} aria-hidden="true" /> <b>Panoda:</b> {clipboard.label}</span>
        <span className="adhd-plan-clipboard-actions">
          <button type="button" onClick={paste} disabled={busy || !userId} className="is-primary">{clipboard.scope === 'day' ? `${dayNames[selectedDay - 1]} gününe yapıştır` : 'Bu haftaya yapıştır'}</button>
          <button type="button" onClick={() => setClipboard(null)}>Temizle</button>
        </span>
      </div>}

      {message && <p className={`adhd-plan-message is-${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}

      <div className="plan-grid">
        <section className="plan-card" id="adhd-day-content" role="tabpanel" aria-labelledby={`adhd-tab-${selectedDay}`}>
          <div className="plan-card-head"><div><p className="plan-eyebrow">{formatTR(selectedKey).toUpperCase()}</p><h2>{dayNames[selectedDay - 1]}</h2></div><span className="plan-total"><ListChecks size={15} />{dayTasks.length} ders</span></div>
          <div className="plan-list" aria-busy={loading}>
            {!dayTasks.length ? <div className="plan-empty"><ListChecks size={28} /><h3>{loading ? 'Yükleniyor…' : 'Bu gün boş'}</h3><p>Sağdan ders ve konu ekle veya panodan yapıştır.</p></div>
              : dayTasks.map((task, i) => (
                <div key={task.id} className={`plan-row ${task.completed_at ? 'adhd-plan-done' : ''}`}>
                  <span className="plan-row-index">{task.completed_at ? <Check size={14} /> : String(i + 1).padStart(2, '0')}</span>
                  <div className="plan-row-copy"><strong>{task.subjects?.name || task.title || 'Ders'}{task.is_extra && <em className="adhd-plan-extra">Ekstra</em>}{task.is_questions && <em className="adhd-plan-extra adhd-plan-q">Soru çözümü</em>}</strong>{task.topic_title && <span className={`adhd-plan-topic ${task.topic_completed_at ? 'is-done' : ''}`}>Konu: {task.topic_title}{task.topic_completed_at ? ' · bitti ✓' : ''}</span>}<span>{[task.note, task.completed_at ? `Yapıldı · ${minutesLabel(task.studied_seconds, 'çalışıldı')}` : task.studied_seconds ? minutesLabel(task.studied_seconds, 'çalışıldı') : ''].filter(Boolean).join(' · ') || 'Bekliyor'}</span></div>
                  <span className="adhd-admin-actions">
                    {task.topic_id && <button type="button" onClick={() => void toggleTopic(task)} disabled={busy} className={`adhd-plan-topic-toggle ${task.topic_completed_at ? 'is-done' : ''}`} aria-label={task.topic_completed_at ? `${task.topic_title} konusunu tekrar aç` : `${task.topic_title} konusunu bitti işaretle`} title={task.topic_completed_at ? 'Konuyu tekrar aç' : 'Konu bitti'}><Check size={15} /></button>}
                    <button type="button" onClick={() => void run(() => moveAdhdTask(dayTasks, i, -1))} disabled={busy || i === 0} aria-label="Yukarı taşı"><ArrowUp size={15} /></button>
                    <button type="button" onClick={() => void run(() => moveAdhdTask(dayTasks, i, 1))} disabled={busy || i === dayTasks.length - 1} aria-label="Aşağı taşı"><ArrowDown size={15} /></button>
                    <button type="button" onClick={() => void run(() => deleteAdhdTask(task.id))} disabled={busy} className="is-danger" aria-label={`${task.subjects?.name || 'Dersi'} sil`}><Trash2 size={15} /></button>
                  </span>
                </div>
              ))}
          </div>
          <div className="plan-list-footer"><span>Haftada {tasks.length} ders</span><span>Yapılan <b>{tasks.filter(task => task.completed_at).length}</b></span></div>
        </section>

        <div className="adhd-plan-side">
          <section className="plan-card">
            <div className="plan-card-head"><div><p className="plan-eyebrow">{dayNames[selectedDay - 1].toUpperCase()} GÜNÜNE EKLE</p><h2>Yeni ders</h2></div><Plus size={20} /></div>
            <form className="plan-form" onSubmit={add}>
              <label>Ders<select value={subjectId} onChange={event => { setSubjectId(event.target.value) }} disabled={!subjectOptions.length || busy}>
                {!subjectOptions.length && <option value="">Bu kişinin dersi yok</option>}
                {subjectOptions.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select></label>
              <div className="adhd-plan-autotopic" aria-live="polite">
                <span>Konu</span>
                <strong>{suggested ? suggested.title : subjectTopics.length ? 'Tüm konular bitti veya planlandı' : 'Bu derste ortak konu yok'}</strong>
                <small>Sistem konuları sırayla kendisi atar; konu bitince sonraki dersler kendiliğinden ilerler.</small>
              </div>
              {catalogProblem && <p className="adhd-plan-hint">{catalogProblem}</p>}
              <label>Kısa not <span>isteğe bağlı</span><input value={note} onChange={event => setNote(event.target.value)} maxLength={200} placeholder="Örn. 20 soru çöz" disabled={busy} /></label>
              <button className="plan-submit" disabled={!subjectId || busy}><Plus size={16} />Ekle</button>
            </form>
          </section>

          <section className="plan-card adhd-plan-sets" aria-labelledby="adhd-sets-title">
            <div className="plan-card-head"><div><p className="plan-eyebrow">TEKRAR KULLAN</p><h2 id="adhd-sets-title">Setlerim</h2></div><Layers size={20} /></div>
            <div className="adhd-plan-sets-body">
              {catalog.size > 0 && (
                <div className="adhd-ideal" aria-labelledby="adhd-ideal-title">
                  <div className="adhd-ideal-head">
                    <span><Sparkles size={16} aria-hidden="true" /> <strong id="adhd-ideal-title">Hazır set · İdeal hafta</strong></span>
                    <button type="button" className="is-primary" aria-label="İdeal haftayı bu haftaya uygula" onClick={() => void applyTemplate(idealItems, '“İdeal hafta” uygulandı')} disabled={busy || !userId || !idealItems.length}>Bu haftaya uygula</button>
                  </div>
                  {ideal.items.length ? <>
                    <p className="adhd-ideal-summary">
                      {ideal.examKnown ? `Sınava ${ideal.weeksLeft} hafta var${ideal.weeksLeft >= 4 ? '; son hafta tekrar için boş bırakıldı' : ''}.` : 'Sınav tarihi girilmemiş; 12 haftada bitecek şekilde hesaplandı.'}
                      {' '}{ideal.remaining} konu kaldı → haftada <b>{ideal.perWeek} ders</b>, her gün en az 2 ders (Pzt–Cmt), Pazar dinlenme.
                    </p>
                    {!ideal.fits && <p className="adhd-plan-message is-error">Konuların yetişmesi için haftada {ideal.needed} ders gerekiyor; DEHB'ye uygun en fazla {ideal.perWeek} ders önerildi. Ekstra çalışmalar açığı kapatır.</p>}
                  </> : <p className="adhd-plan-hint">Tüm ortak konular bitmiş görünüyor. 🎉</p>}
                  {idealItems.length > 0 && <ol className="adhd-ideal-days">{dayShort.map((short, i) => {
                    const dayItems = idealItems.filter(item => item.day === i + 1)
                    if (i === 6 && !dayItems.length) return null
                    return <li key={short}><b>{short}</b><span>{dayItems.map((item, n) => <span key={n} className={item.questions ? 'adhd-ideal-q' : ''}>{n ? ' · ' : ''}{item.questions ? '📝 ' : ''}{item.subject_name}</span>)}{!dayItems.length && '—'}</span></li>
                  })}</ol>}

                  <div className="adhd-ideal-questions" aria-labelledby="adhd-questions-title">
                    <strong id="adhd-questions-title">📝 Soru çözümü</strong>
                    <p className="adhd-plan-hint">Deneme veya soru çözümü yaz, günlerini seç; ideal hafta her uygulandığında konusuz olarak eklenir.</p>
                    {questionsProblem ? <p className="adhd-plan-message is-error" role="alert">{questionsProblem}</p> : <>
                      {questionItems.length > 0 && <ul className="adhd-question-list">{questionItems.map(item => (
                        <li key={item.id}>
                          <span><strong>{item.label}</strong><small>{item.days.map(day => dayShort[day - 1]).join(', ')}</small></span>
                          <button type="button" onClick={() => void removeQuestion(item.id)} disabled={busy} className="is-danger" aria-label={`${item.label} soru çözümünü sil`}><Trash2 size={15} /></button>
                        </li>
                      ))}</ul>}
                      <form className="adhd-question-form" onSubmit={addQuestion}>
                        <input value={questionLabel} onChange={event => setQuestionLabel(event.target.value)} maxLength={120} placeholder="Ör. YDS veya Sözel Yetenek Deneme" aria-label="Soru çözümü adı" disabled={busy} />
                        <div className="adhd-question-days" role="group" aria-label="Soru çözümü günleri">
                          {dayShort.map((short, i) => <button key={short} type="button" aria-pressed={questionDays.includes(i + 1)} className={questionDays.includes(i + 1) ? 'is-on' : ''} onClick={() => setQuestionDays(previous => previous.includes(i + 1) ? previous.filter(day => day !== i + 1) : [...previous, i + 1])} disabled={busy}>{short}</button>)}
                        </div>
                        <button type="submit" disabled={busy || !questionLabel.trim() || !questionDays.length}><Plus size={15} /> Soru çözümü ekle</button>
                      </form>
                    </>}
                  </div>
                </div>
              )}
              {setsProblem ? <p className="adhd-plan-message is-error" role="alert">{setsProblem}</p> : <>
                <form onSubmit={saveSet} className="adhd-plan-set-form">
                  <input value={setName} onChange={event => setSetName(event.target.value)} maxLength={60} placeholder="Set adı · ör. Normal hafta" aria-label="Set adı" disabled={busy} />
                  <button type="submit" disabled={busy || !setName.trim() || !tasks.length}><Save size={15} />Bu haftayı set yap</button>
                </form>
                {!sets.length ? <p className="adhd-plan-hint">Henüz set yok. Bir haftayı hazırlayıp ad vererek kaydet; sonra istediğin haftaya tek tıkla uygula. Set dersleri tutar, her uygulamada konular kaldığı yerden ilerler.</p>
                  : <ul>{sets.map(set => {
                    const days = new Set(set.items.map(item => item.day)).size
                    return <li key={set.id}>
                      <span><strong>{set.name}</strong><small>{set.items.length} ders · {days} gün</small></span>
                      <button type="button" onClick={() => void applyTemplate(set.items, `“${set.name}” uygulandı`)} disabled={busy || !userId} className="is-primary" aria-label={`${set.name} setini bu haftaya uygula`}>Bu haftaya uygula</button>
                      <button type="button" onClick={() => void removeSet(set)} disabled={busy} className="is-danger" aria-label={`${set.name} setini sil`}><Trash2 size={15} /></button>
                    </li>
                  })}</ul>}
              </>}
            </div>
          </section>
        </div>
      </div>

      {progress.length > 0 && (
        <section className="plan-card adhd-topic-progress" aria-labelledby="adhd-progress-title">
          <div className="plan-card-head">
            <div><p className="plan-eyebrow">ORTAK AGS KONULARI</p><h2 id="adhd-progress-title">Konu ilerlemesi</h2></div>
            <span className="plan-total"><CheckCircle2 size={15} />{doneTopics} / {totalTopics} konu bitti</span>
          </div>
          <div className="adhd-topic-progress-body">
            {progress.map(row => {
              const done = row.topics.filter(topic => topic.completed).length
              return (
                <details key={row.id} open className="adhd-topic-subject">
                  <summary>
                    <strong>{row.name}</strong><span>{done} / {row.topics.length}</span>
                    <span className="adhd-topic-bar" aria-hidden="true"><span style={{ width: `${row.topics.length ? Math.round(done / row.topics.length * 100) : 0}%` }} /></span>
                  </summary>
                  {!row.topics.length ? <p className="adhd-plan-hint">Bu derste ortak konu yok.</p> : (
                    <ul aria-label={`${row.name} konuları`}>
                      {row.topics.map(topic => {
                        const key = topicKey(topic.kind, topic.id)
                        return <li key={key} className={topic.completed ? 'is-done' : ''}>
                          <span className="adhd-topic-tick" aria-label={topic.completed ? 'Tamamlandı' : 'Tamamlanmadı'}>{topic.completed && <Check size={13} />}</span>
                          <span className="adhd-topic-name">{topic.title}</span>
                          {!topic.completed && taken.has(key) && <small>planlandı</small>}
                        </li>
                      })}
                    </ul>
                  )}
                </details>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
