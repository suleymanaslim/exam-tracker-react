import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Check, LogOut, Play, Square, RotateCw, Sparkles } from 'lucide-react'
import { localDayKey } from '../lib/statsPeriod'
import {
  ADHD_CHANGED_EVENT, ADHD_DONE_SECONDS, adhdError, formatClock, loadRunningTimer, minutesLabel,
  readAdhdTasks, recordAdhdStudy, setAdhdTopicDone, storeRunningTimer,
} from '../lib/adhdMode'
import type { AdhdTask, RunningAdhdTimer } from '../lib/adhdMode'
import './AdhdToday.css'

const dateLabel = (date: Date) => date.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
const subjectName = (task?: AdhdTask | null) => task?.subjects?.name || 'Ders'

type Finish = { timer: RunningAdhdTimer; endedAt: Date; seconds: number; saving: boolean; error: string }

export default function AdhdToday({ userId, onLogout }: { userId: string; onLogout?: () => void }) {
  const [today, setToday] = useState(() => localDayKey(new Date()))
  const [tasks, setTasks] = useState<AdhdTask[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [running, setRunning] = useState<RunningAdhdTimer | null>(() => loadRunningTimer(userId))
  const [now, setNow] = useState(() => Date.now())
  const [finish, setFinish] = useState<Finish | null>(null)
  const [celebrate, setCelebrate] = useState<AdhdTask | null>(null)
  // Ders bitince sorulur: "Bu konuyu bitirdin mi?" Kişi tüm konu listesini hiç görmez.
  const [askTopic, setAskTopic] = useState<AdhdTask | null>(null)
  const [topicSaving, setTopicSaving] = useState(false)
  const [topicError, setTopicError] = useState('')
  const [topicDone, setTopicDone] = useState('')
  const request = useRef(0)

  const load = useCallback(async () => {
    const id = ++request.current
    try {
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

  useEffect(() => {
    if (!running) return
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(tick)
  }, [running])

  const runningTask = running ? tasks.find(task => task.id === running.taskId) ?? null : null
  // Kronometredeki ders admin tarafından silinmişse sessizce kapat.
  useEffect(() => {
    if (running && !loading && !loadError && !runningTask) { storeRunningTimer(userId, null); setRunning(null) }
  }, [running, runningTask, loading, loadError, userId])

  const done = tasks.filter(task => task.completed_at).length
  const next = useMemo(() => tasks.find(task => !task.completed_at) ?? null, [tasks])
  const elapsed = running ? Math.max(0, Math.floor((now - Date.parse(running.startedAt)) / 1000)) : 0

  const start = (task: AdhdTask) => {
    if (running) return
    const timer = { taskId: task.id, sessionId: crypto.randomUUID(), startedAt: new Date().toISOString() }
    storeRunningTimer(userId, timer); setRunning(timer); setNow(Date.now()); setCelebrate(null)
  }

  const save = async (state: Finish) => {
    setFinish({ ...state, saving: true, error: '' })
    try {
      const saved = await recordAdhdStudy(state.timer, state.endedAt)
      storeRunningTimer(userId, null); setRunning(null); setFinish(null)
      setTasks(previous => previous.map(task => task.id === saved.id ? { ...task, ...saved, subjects: task.subjects } : task))
      const merged = { ...saved, subjects: runningTask?.subjects ?? tasks.find(task => task.id === saved.id)?.subjects }
      if (saved.completed_at) setCelebrate(merged)
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

  const answerTopic = async (finished: boolean) => {
    if (!askTopic) return
    if (!finished) { setAskTopic(null); return }
    setTopicSaving(true); setTopicError('')
    try {
      const saved = await setAdhdTopicDone(askTopic.id, true)
      setTasks(previous => previous.map(task => task.topic_kind === saved.topic_kind && task.topic_id === saved.topic_id ? { ...task, topic_completed_at: saved.topic_completed_at } : task))
      setTopicDone(askTopic.topic_title || ''); setAskTopic(null)
    } catch (error) { setTopicError(adhdError(error)) }
    finally { setTopicSaving(false) }
  }

  const discard = () => { storeRunningTimer(userId, null); setRunning(null); setFinish(null) }

  // ── Odak ekranı: yalnızca tek ders ve kronometre ───────────────────────
  if (running && runningTask) {
    const passed = elapsed >= ADHD_DONE_SECONDS || Boolean(runningTask.completed_at)
    const short = finish && finish.seconds < ADHD_DONE_SECONDS && !runningTask.completed_at
    return (
      <div className="adhd adhd-focus" role="main">
        <div className="adhd-focus-inner">
          <p className="adhd-focus-kicker">Şu an çalıştığın ders</p>
          <h1 className="adhd-focus-subject">{subjectName(runningTask)}</h1>
          {runningTask.topic_title && <p className="adhd-focus-topic"><BookOpen size={20} aria-hidden="true" /> {runningTask.topic_title}</p>}
          {runningTask.note && <p className="adhd-focus-note">{runningTask.note}</p>}
          <div className="adhd-clock" aria-live="off" aria-label={`Geçen süre ${formatClock(elapsed)}`}>{formatClock(elapsed)}</div>
          <p className={`adhd-focus-status ${passed ? 'is-done' : ''}`} aria-live="polite">
            {passed ? <><Check size={20} aria-hidden="true" /> Bu ders yapıldı sayılacak. İstediğin kadar devam et.</> : 'Bir dakika çalışman yeterli. Başladın bile!'}
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
        : !tasks.length ? <div className="adhd-card adhd-center"><p className="adhd-big">Bugün için ders eklenmemiş.</p><p className="adhd-muted">Planın hazır olunca burada görünecek.</p></div>
        : <>
          <section className="adhd-progress" aria-label={`${tasks.length} dersten ${done} tanesi yapıldı`}>
            <div className="adhd-progress-bar">{tasks.map(task => <span key={task.id} className={task.completed_at ? 'is-done' : ''} />)}</div>
            <p><strong>{done}</strong> / {tasks.length} ders yapıldı</p>
          </section>

          {celebrate && <div className="adhd-celebrate" role="status"><Sparkles size={24} aria-hidden="true" /><p><strong>Harika!</strong> {subjectName(celebrate)} yapıldı.</p></div>}

          {askTopic && (
            <section className="adhd-card adhd-topic-ask" aria-labelledby="adhd-topic-ask-title">
              <p className="adhd-kicker">Konu</p>
              <h2 id="adhd-topic-ask-title" className="adhd-topic-ask-title">{askTopic.topic_title}</h2>
              <p className="adhd-topic-ask-question">Bu konuyu bitirdin mi?</p>
              <div className="adhd-row">
                <button type="button" className="adhd-btn adhd-btn-done" onClick={() => void answerTopic(true)} disabled={topicSaving} autoFocus><Check size={22} aria-hidden="true" /> {topicSaving ? 'Kaydediliyor…' : 'Evet, bitti'}</button>
                <button type="button" className="adhd-btn adhd-btn-ghost" onClick={() => void answerTopic(false)} disabled={topicSaving}>Henüz bitmedi</button>
              </div>
              {topicError && <p className="adhd-topic-error" role="alert">{topicError}</p>}
            </section>
          )}
          {topicDone && !askTopic && <div className="adhd-celebrate" role="status"><Check size={24} aria-hidden="true" /><p><strong>Konu bitti:</strong> {topicDone}</p></div>}

          {next ? (
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

          <ol className="adhd-list" aria-label="Bugünün dersleri">
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
                  {task.completed_at && task.topic_id && !task.topic_completed_at && askTopic?.id !== task.id && <button type="button" className="adhd-btn adhd-btn-small" onClick={() => { setTopicDone(''); setTopicError(''); setAskTopic(task) }}>Konu bitti mi?</button>}
                  {!isNext && <button type="button" className="adhd-btn adhd-btn-small" onClick={() => start(task)} aria-label={`${subjectName(task)} için kronometreyi başlat`}><Play size={18} aria-hidden="true" />{task.completed_at ? 'Yine çalış' : 'Başla'}</button>}
                </li>
              )
            })}
          </ol>
        </>}
    </div>
  )
}
