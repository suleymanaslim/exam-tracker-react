import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BellRing, BookOpen, Check, LogOut, Play, Plus, Square, RotateCw, Sparkles } from 'lucide-react'
import { localDayKey } from '../lib/statsPeriod'
import {
  ADHD_CHANGED_EVENT, ADHD_DONE_SECONDS, addAdhdExtra, advanceAdhdTopics, pullAdhdTaskForward, readNextDayTasks, adhdError, changeAdhdTaskTopic, loadRunningTimer, minutesLabel,
  readAdhdSubjects, readAdhdTasks, readTopicCatalog, recordAdhdStudy, setAdhdTopicDone, storeRunningTimer,
} from '../lib/adhdMode'
import { isAgsExam } from '../lib/agsTopicSource'
import type { CatalogTopic } from '../lib/adhdPlan'
import type { AdhdTask, RunningAdhdTimer } from '../lib/adhdMode'
import './AdhdToday.css'

const dateLabel = (date: Date) => date.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
const subjectName = (task?: AdhdTask | null) => task?.subjects?.name || task?.title || 'Ders'
/** Bitince gösterilen süre: "25 dakika", "1 saat 10 dakika" */
const studyTime = (seconds: number) => {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} dakika`
  const rest = minutes % 60
  return `${Math.floor(minutes / 60)} saat${rest ? ` ${rest} dakika` : ''}`
}

type Finish = { timer: RunningAdhdTimer; endedAt: Date; seconds: number; saving: boolean; error: string }

export default function AdhdToday({ userId, onLogout }: { userId: string; onLogout?: () => void }) {
  const [today, setToday] = useState(() => localDayKey(new Date()))
  const [tasks, setTasks] = useState<AdhdTask[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [running, setRunning] = useState<RunningAdhdTimer | null>(() => loadRunningTimer(userId))
  const [finish, setFinish] = useState<Finish | null>(null)
  const [celebrate, setCelebrate] = useState<{ task: AdhdTask; seconds: number } | null>(null)
  // Ders bitince sorulur: "Bu konuyu bitirdin mi?" Kişi tüm konu listesini hiç görmez.
  const [askTopic, setAskTopic] = useState<AdhdTask | null>(null)
  const [topicSaving, setTopicSaving] = useState(false)
  const [topicError, setTopicError] = useState('')
  const [topicDone, setTopicDone] = useState('')
  // "Başka bir konu çalıştım": o dersin bitmemiş konularından seçim
  const [topicChoices, setTopicChoices] = useState<CatalogTopic[] | null>(null)
  // Ekstra çalışma: kişi istediği dersi seçer
  const [extraSubjects, setExtraSubjects] = useState<{ id: string; name: string }[] | null>(null)
  const [upcoming, setUpcoming] = useState<AdhdTask[]>([])
  const [extraBusy, setExtraBusy] = useState(false)
  const [extraError, setExtraError] = useState('')
  const request = useRef(0)
  const extraPanel = useRef<HTMLElement>(null)
  const extraOpen = extraSubjects !== null
  // Seçim kutusu sayfanın altında açılır; görünür olsun.
  useEffect(() => { if (extraOpen) extraPanel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }, [extraOpen])

  const load = useCallback(async () => {
    const id = ++request.current
    try {
      // Konular kendiliğinden ilerler (kronometre açıkken çalışılan dersin konusu değişmesin).
      if (!loadRunningTimer(userId)) await advanceAdhdTopics(userId)
      const rows = await readAdhdTasks(userId, today)
      if (id !== request.current) return
      setTasks(rows); setLoadError('')
    } catch (error) { if (id === request.current) setLoadError(adhdError(error)) }
    finally { if (id === request.current) setLoading(false) }
  }, [userId, today])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    // Kronometre açıkken gün değişse bile çalışılan ders ekrandan kaybolmasın.
    const rollDay = () => { if (!loadRunningTimer(userId)) setToday(localDayKey(new Date())) }
    const refresh = () => { rollDay(); void load() }
    const interval = window.setInterval(rollDay, 60000)
    window.addEventListener('focus', refresh); window.addEventListener(ADHD_CHANGED_EVENT, refresh)
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener(ADHD_CHANGED_EVENT, refresh) }
  }, [load, userId])


  const runningTask = running ? tasks.find(task => task.id === running.taskId) ?? null : null
  // Kronometredeki ders admin tarafından silinmişse sessizce kapat.
  useEffect(() => {
    if (running && !loading && !loadError && !runningTask) { storeRunningTimer(userId, null); setRunning(null) }
  }, [running, runningTask, loading, loadError, userId])

  const planned = useMemo(() => tasks.filter(task => !task.is_extra), [tasks])
  const extras = useMemo(() => tasks.filter(task => task.is_extra), [tasks])
  const done = planned.filter(task => task.completed_at).length
  const next = useMemo(() => planned.find(task => !task.completed_at) ?? null, [planned])

  const start = (task: AdhdTask) => {
    if (running) return
    const timer = { taskId: task.id, sessionId: crypto.randomUUID(), startedAt: new Date().toISOString() }
    storeRunningTimer(userId, timer); setRunning(timer); setCelebrate(null)
  }

  const save = async (state: Finish) => {
    setFinish({ ...state, saving: true, error: '' })
    try {
      const saved = await recordAdhdStudy(state.timer, state.endedAt)
      storeRunningTimer(userId, null); setRunning(null); setFinish(null)
      setTasks(previous => previous.map(task => task.id === saved.id ? { ...task, ...saved, subjects: task.subjects } : task))
      const merged = { ...saved, subjects: runningTask?.subjects ?? tasks.find(task => task.id === saved.id)?.subjects }
      if (saved.completed_at) setCelebrate({ task: merged, seconds: state.seconds })
      setTopicDone(''); setTopicError('')
      setAskTopic(saved.completed_at && saved.topic_id && !saved.topic_completed_at ? merged : null)
    } catch (error) { setFinish({ ...state, saving: false, error: adhdError(error) }) }
  }

  const stop = () => {
    if (!running) return
    const endedAt = new Date()
    const seconds = Math.floor((endedAt.getTime() - Date.parse(running.startedAt)) / 1000)
    const state: Finish = { timer: running, endedAt, seconds, saving: false, error: '' }
    const alreadyDone = Boolean(runningTask?.completed_at)
    if (seconds < ADHD_DONE_SECONDS && !alreadyDone) { setFinish(state); return }
    void save(state)
  }

  const openTopicChoices = async () => {
    if (!askTopic?.subject_id) return
    const subjectId = askTopic.subject_id
    setTopicSaving(true); setTopicError('')
    try {
      const catalog = await readTopicCatalog(userId, [{ id: subjectId, name: subjectName(askTopic), ags: true }])
      const list = (catalog.get(subjectId) || []).filter(topic => !topic.completed && topic.id !== askTopic.topic_id)
      if (!list.length) setTopicError('Bu derste seçilebilecek başka konu yok.')
      else setTopicChoices(list)
    } catch (error) { setTopicError(adhdError(error)) }
    finally { setTopicSaving(false) }
  }

  const chooseTopic = async (topic: CatalogTopic) => {
    if (!askTopic) return
    setTopicSaving(true); setTopicError('')
    try {
      const saved = await changeAdhdTaskTopic(askTopic.id, topic.id)
      const merged = { ...askTopic, ...saved, subjects: askTopic.subjects }
      setTasks(previous => previous.map(task => task.id === saved.id ? merged : task))
      setTopicChoices(null)
      // Yeni konu için soru tekrar sorulur.
      setAskTopic(saved.topic_completed_at ? null : merged)
      if (saved.topic_completed_at) setTopicDone(saved.topic_title || '')
      void advanceAdhdTopics(userId).then(changed => { if (changed) void load() })
    } catch (error) { setTopicError(adhdError(error)) }
    finally { setTopicSaving(false) }
  }

  const openExtra = async () => {
    setExtraError(''); setCelebrate(null)
    setExtraSubjects([]); setUpcoming([])
    // Önce yarının (bir sonraki planlı günün) dersleri önerilir.
    void readNextDayTasks(userId, today).then(setUpcoming, () => setUpcoming([]))
    try {
      const rows = await readAdhdSubjects(userId)
      const ags = rows.filter(row => isAgsExam(row.exams || undefined))
      const list = (ags.length ? ags : rows).map(row => ({ id: row.id, name: row.name }))
      if (!list.length) setExtraError('Ders bulunamadı.')
      setExtraSubjects(list)
    } catch (error) { setExtraError(adhdError(error)) }
  }

  const pullForward = async (task: AdhdTask) => {
    if (extraBusy || running) return
    setExtraBusy(true); setExtraError('')
    try {
      const saved = await pullAdhdTaskForward(task.id, today)
      const moved = { ...task, ...saved, subjects: task.subjects }
      setTasks(previous => [...previous, moved])
      setExtraSubjects(null); setUpcoming([])
      start(moved)
    } catch (error) { setExtraError(adhdError(error)) }
    finally { setExtraBusy(false) }
  }

  const startExtra = async (subject: { id: string; name: string }) => {
    if (extraBusy || running) return
    setExtraBusy(true); setExtraError('')
    try {
      const saved = await addAdhdExtra(subject.id, today)
      const task = { ...saved, subjects: { name: subject.name } }
      setTasks(previous => [...previous, task])
      setExtraSubjects(null)
      start(task)
    } catch (error) { setExtraError(adhdError(error)) }
    finally { setExtraBusy(false) }
  }

  const answerTopic = async (finished: boolean) => {
    if (!askTopic) return
    if (!finished) { setAskTopic(null); setTopicChoices(null); return }
    setTopicSaving(true); setTopicError('')
    try {
      const saved = await setAdhdTopicDone(askTopic.id, true)
      setTasks(previous => previous.map(task => task.topic_kind === saved.topic_kind && task.topic_id === saved.topic_id ? { ...task, topic_completed_at: saved.topic_completed_at } : task))
      setTopicDone(askTopic.topic_title || ''); setAskTopic(null)
      // Konu bitti: sonraki dersler bir sonraki konuya kayar.
      void advanceAdhdTopics(userId).then(changed => { if (changed) void load() })
    } catch (error) { setTopicError(adhdError(error)) }
    finally { setTopicSaving(false) }
  }

  const discard = () => { storeRunningTimer(userId, null); setRunning(null); setFinish(null) }

  // ── Odak ekranı: yalnızca tek ders ve kronometre ───────────────────────
  if (running && runningTask) {
    const short = finish && finish.seconds < ADHD_DONE_SECONDS && !runningTask.completed_at
    return (
      <div className="adhd adhd-focus" role="main">
        <div className="adhd-focus-inner">
          <p className="adhd-focus-kicker">{runningTask.is_questions ? 'Soru çözümü' : runningTask.topic_title ? 'Şu an çalıştığın konu' : 'Şu an çalıştığın ders'}</p>
          {runningTask.topic_title ? <>
            {/* Konu açıldığında en büyük yazı konu adıdır; ders adı üstte küçük durur. */}
            <p className="adhd-focus-subject-small">{subjectName(runningTask)}</p>
            <h1 className="adhd-focus-topic-big">{runningTask.topic_title}</h1>
          </> : <h1 className="adhd-focus-subject">{subjectName(runningTask)}</h1>}
          {runningTask.note && <p className="adhd-focus-note">{runningTask.note}</p>}
          {/* Süre bilerek gösterilmez; yalnızca bitince söylenir. */}
          <div className="adhd-focus-running" aria-hidden="true"><span /></div>
          <p className="adhd-focus-status adhd-focus-reminder" aria-live="polite">
            <BellRing size={20} aria-hidden="true" /><span>Çalışman bitince <strong>Bitir</strong>’e basmayı unutma!</span>
          </p>

          {short ? (
            <div className="adhd-confirm" role="alertdialog" aria-labelledby="adhd-short-title">
              <p id="adhd-short-title"><strong>Henüz 1 dakika olmadı.</strong> Biraz daha devam edersen bu ders yapıldı sayılacak.</p>
              <div className="adhd-row">
                <button type="button" className="adhd-btn adhd-btn-primary" autoFocus onClick={() => setFinish(null)}><Play size={22} aria-hidden="true" /> Devam et</button>
                <button type="button" className="adhd-btn adhd-btn-ghost" onClick={discard}>Kaydetmeden çık</button>
              </div>
            </div>
          ) : finish?.error ? (
            <div className="adhd-confirm" role="alert">
              <p>{finish.error} Süren kaybolmadı.</p>
              <button type="button" className="adhd-btn adhd-btn-primary" onClick={() => void save(finish)}><RotateCw size={22} aria-hidden="true" /> Tekrar kaydet</button>
            </div>
          ) : (
            <button type="button" className="adhd-btn adhd-btn-stop" onClick={stop} disabled={finish?.saving}>
              <Square size={22} aria-hidden="true" /> {finish?.saving ? 'Kaydediliyor…' : 'Bitir'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Bugünün listesi ───────────────────────────────────────────────────
  return (
    <div className="adhd" role="main">
      <header className="adhd-header">
        <div>
          <p className="adhd-date">{dateLabel(new Date(`${today}T12:00:00`))}</p>
          <h1 className="adhd-title">Bugün yapacakların</h1>
        </div>
        {onLogout && <button type="button" className="adhd-logout" onClick={onLogout} aria-label="Çıkış yap"><LogOut size={20} aria-hidden="true" /></button>}
      </header>

      {loading ? <p className="adhd-muted" role="status">Yükleniyor…</p>
        : loadError ? <div className="adhd-card adhd-center" role="alert"><p>{loadError}</p><button type="button" className="adhd-btn adhd-btn-primary" onClick={() => void load()}><RotateCw size={20} aria-hidden="true" /> Tekrar dene</button></div>
        : <>
          {planned.length > 0 && <section className="adhd-progress" aria-label={`${planned.length} dersten ${done} tanesi yapıldı`}>
            <div className="adhd-progress-bar">{planned.map(task => <span key={task.id} className={task.completed_at ? 'is-done' : ''} />)}</div>
            <p><strong>{done}</strong> / {planned.length} ders yapıldı</p>
          </section>}

          {celebrate && <div className="adhd-celebrate" role="status"><Sparkles size={24} aria-hidden="true" /><p><strong>Harika!</strong> {subjectName(celebrate.task)} yapıldı. <span className="adhd-celebrate-time">{studyTime(celebrate.seconds)} çalıştın.</span></p></div>}

          {askTopic && (
            <section className="adhd-card adhd-topic-ask" aria-labelledby="adhd-topic-ask-title">
              {topicChoices ? <>
                <p className="adhd-kicker">{subjectName(askTopic)}</p>
                <h2 id="adhd-topic-ask-title" className="adhd-topic-ask-title">Hangi konuyu çalıştın?</h2>
                <ul className="adhd-topic-choices" aria-label="Konular">
                  {topicChoices.map(topic => <li key={topic.id}><button type="button" className="adhd-btn adhd-btn-choice" onClick={() => void chooseTopic(topic)} disabled={topicSaving}>{topic.title}</button></li>)}
                </ul>
                <button type="button" className="adhd-btn adhd-btn-ghost" onClick={() => setTopicChoices(null)} disabled={topicSaving}><ArrowLeft size={20} aria-hidden="true" /> Geri</button>
              </> : <>
                <p className="adhd-kicker">Konu</p>
                <h2 id="adhd-topic-ask-title" className="adhd-topic-ask-title">{askTopic.topic_title}</h2>
                <p className="adhd-topic-ask-question">Bu konuyu bitirdin mi?</p>
                <div className="adhd-row">
                  <button type="button" className="adhd-btn adhd-btn-done" onClick={() => void answerTopic(true)} disabled={topicSaving} autoFocus><Check size={22} aria-hidden="true" /> {topicSaving ? 'Kaydediliyor…' : 'Evet, bitti'}</button>
                  <button type="button" className="adhd-btn adhd-btn-ghost" onClick={() => void answerTopic(false)} disabled={topicSaving}>Henüz bitmedi</button>
                </div>
                <button type="button" className="adhd-link" onClick={() => void openTopicChoices()} disabled={topicSaving}>Başka bir konu çalıştım</button>
              </>}
              {topicError && <p className="adhd-topic-error" role="alert">{topicError}</p>}
            </section>
          )}
          {topicDone && !askTopic && <div className="adhd-celebrate" role="status"><Check size={24} aria-hidden="true" /><p><strong>Konu bitti:</strong> {topicDone}</p></div>}

          {!planned.length ? <div className="adhd-card adhd-center"><p className="adhd-big">Bugün için ders eklenmemiş.</p><p className="adhd-muted">İstersen aşağıdan ekstra çalışabilirsin.</p></div>
            : next ? (
            <section className="adhd-card adhd-next" aria-labelledby="adhd-next-title">
              <p className="adhd-kicker">Sıradaki</p>
              <h2 id="adhd-next-title" className="adhd-next-subject">{subjectName(next)}</h2>
              {next.topic_title && <p className="adhd-next-topic"><BookOpen size={20} aria-hidden="true" /> {next.topic_title}</p>}
              {next.note && <p className="adhd-next-note">{next.note}</p>}
              {next.studied_seconds > 0 && <p className="adhd-muted">{minutesLabel(next.studied_seconds)}</p>}
              <button type="button" className="adhd-btn adhd-btn-primary adhd-btn-xl" onClick={() => start(next)}><Play size={26} aria-hidden="true" /> Başla</button>
            </section>
          ) : (
            <section className="adhd-card adhd-center adhd-all-done"><Sparkles size={34} aria-hidden="true" /><p className="adhd-big">Bugünün hepsi bitti!</p><p className="adhd-muted">Kendinle gurur duy. Dinlenmeyi hak ettin.</p></section>
          )}

          {planned.length > 0 && <TaskList label="Bugünün dersleri" tasks={planned} next={next} askTopic={askTopic} onStart={start} onAskTopic={task => { setTopicDone(''); setTopicError(''); setTopicChoices(null); setAskTopic(task) }} />}

          {extras.length > 0 && <>
            <h2 className="adhd-section-title">Ekstra çalışmaların</h2>
            <TaskList label="Ekstra çalışmalar" tasks={extras} next={null} askTopic={askTopic} onStart={start} onAskTopic={task => { setTopicDone(''); setTopicError(''); setTopicChoices(null); setAskTopic(task) }} />
          </>}

          {extraSubjects ? (
            <section ref={extraPanel} className="adhd-card adhd-extra" aria-labelledby="adhd-extra-title">
              {upcoming.length > 0 && <>
                <h2 className="adhd-topic-ask-title">Yarının derslerinden öne al</h2>
                <p className="adhd-muted">Şimdi çalışırsan o gün daha hafif olur.</p>
                <div className="adhd-extra-grid adhd-upcoming" role="group" aria-label="Sonraki günün dersleri">
                  {upcoming.map(task => <button key={task.id} type="button" className="adhd-btn adhd-btn-choice adhd-btn-upcoming" onClick={() => void pullForward(task)} disabled={extraBusy}>
                    <span><strong>{subjectName(task)}</strong>{task.topic_title && <small>{task.topic_title}</small>}</span>
                  </button>)}
                </div>
              </>}
              <h2 id="adhd-extra-title" className="adhd-topic-ask-title">{upcoming.length ? 'Ya da istediğin derse çalış' : 'Hangi derse ekstra çalışmak istersin?'}</h2>
              <div className="adhd-extra-grid">
                {extraSubjects.map(subject => <button key={subject.id} type="button" className="adhd-btn adhd-btn-choice" onClick={() => void startExtra(subject)} disabled={extraBusy}>{subject.name}</button>)}
              </div>
              {extraError && <p className="adhd-topic-error" role="alert">{extraError}</p>}
              <button type="button" className="adhd-btn adhd-btn-ghost" onClick={() => setExtraSubjects(null)} disabled={extraBusy}>Vazgeç</button>
            </section>
          ) : (
            <button type="button" className="adhd-btn adhd-btn-extra" onClick={() => void openExtra()}><Plus size={22} aria-hidden="true" /> Ekstra çalışma</button>
          )}
          {!extraSubjects && extraError && <p className="adhd-topic-error" role="alert">{extraError}</p>}
        </>}
    </div>
  )
}

function TaskList({ label, tasks, next, askTopic, onStart, onAskTopic }: {
  label: string; tasks: AdhdTask[]; next: AdhdTask | null; askTopic: AdhdTask | null
  onStart: (task: AdhdTask) => void; onAskTopic: (task: AdhdTask) => void
}) {
  return (
    <ol className="adhd-list" aria-label={label}>
      {tasks.map(task => {
        const isNext = task.id === next?.id
        return (
          <li key={task.id} className={`adhd-item ${task.completed_at ? 'is-done' : ''} ${isNext ? 'is-next' : ''}`}>
            <span className="adhd-check" aria-hidden="true">{task.completed_at && <Check size={20} />}</span>
            <span className="adhd-item-text">
              <strong>{subjectName(task)}</strong>
              {task.topic_title && <small className={`adhd-item-topic ${task.topic_completed_at ? 'is-done' : ''}`}>{task.topic_title}{task.topic_completed_at ? ' · konu bitti ✓' : ''}</small>}
              <small>{task.completed_at ? `Yapıldı · ${minutesLabel(task.studied_seconds)}` : task.note || (task.studied_seconds ? minutesLabel(task.studied_seconds) : 'Bekliyor')}</small>
            </span>
            {task.completed_at && task.topic_id && !task.topic_completed_at && askTopic?.id !== task.id && <button type="button" className="adhd-btn adhd-btn-small" onClick={() => onAskTopic(task)}>Konu bitti mi?</button>}
            {!isNext && <button type="button" className="adhd-btn adhd-btn-small" onClick={() => onStart(task)} aria-label={`${subjectName(task)} için kronometreyi başlat`}><Play size={18} aria-hidden="true" />{task.completed_at ? 'Yine çalış' : 'Başla'}</button>}
          </li>
        )
      })}
    </ol>
  )
}
