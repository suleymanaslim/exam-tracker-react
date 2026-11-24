import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Copy, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { localDayKey } from '../lib/statsPeriod'
import { isAgsExam } from '../lib/agsTopicSource'
import { profileNameLabel } from '../lib/profileName'
import {
  addAdhdTask, adhdError, copyAdhdTasks, deleteAdhdTask, minutesLabel, moveAdhdTask, readAdhdTasks, setAdhdEnabled,
} from '../lib/adhdMode'
import type { AdhdTask } from '../lib/adhdMode'

interface Profile { id: string; display_name: string | null; email: string | null }
interface Subject { id: string; name: string; exams?: { name?: string; base_template_key?: string | null } | null }
export interface AdhdPlanDialogHandle { open: (profile: Profile, enabled: boolean, trigger: HTMLElement) => void }

const shiftDay = (day: string, amount: number) => {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return localDayKey(date)
}
const dayLabel = (day: string) => {
  const today = localDayKey(new Date())
  const prefix = day === today ? 'Bugün · ' : day === shiftDay(today, 1) ? 'Yarın · ' : day === shiftDay(today, -1) ? 'Dün · ' : ''
  return prefix + new Date(`${day}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
}

const AdhdPlanDialog = forwardRef<AdhdPlanDialogHandle, { onEnabledChange: (userId: string, enabled: boolean) => void }>(function AdhdPlanDialog({ onEnabledChange }, ref) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [day, setDay] = useState(() => localDayKey(new Date()))
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [tasks, setTasks] = useState<AdhdTask[]>([])
  const [subjectId, setSubjectId] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)

  useImperativeHandle(ref, () => ({
    open(next, isEnabled, from) {
      trigger.current = from
      setProfile(next); setEnabled(isEnabled); setDay(localDayKey(new Date())); setNote(''); setError(''); setTasks([]); setSubjects([]); setSubjectId('')
      dialog.current?.showModal()
    },
  }), [])

  useEffect(() => {
    if (!profile) return
    let active = true
    void supabase.from('subjects').select('id,name,exams(name,base_template_key)').eq('user_id', profile.id).order('name').then(({ data, error: subjectError }) => {
      if (!active) return
      if (subjectError) { setError('Dersler yüklenemedi.'); return }
      const rows = (data || []) as unknown as Subject[]
      const ags = rows.filter(row => isAgsExam(row.exams || undefined))
      const list = ags.length ? ags : rows
      setSubjects(list); setSubjectId(current => current || list[0]?.id || '')
    })
    return () => { active = false }
  }, [profile])

  const loadTasks = useCallback(async () => {
    if (!profile) return
    const id = ++request.current
    setLoading(true)
    try {
      const rows = await readAdhdTasks(profile.id, day)
      if (id === request.current) setTasks(rows)
    } catch (loadError) { if (id === request.current) setError(adhdError(loadError)) }
    finally { if (id === request.current) setLoading(false) }
  }, [profile, day])
  useEffect(() => { void loadTasks() }, [loadTasks])

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true); setError('')
    try { await action(); await loadTasks() } catch (actionError) { setError(adhdError(actionError)) } finally { setBusy(false) }
  }

  const close = () => {
    if (busy) return
    dialog.current?.close(); setProfile(null); trigger.current?.focus()
  }

  const toggle = () => run(async () => {
    if (!profile) return
    await setAdhdEnabled(profile.id, !enabled)
    setEnabled(!enabled); onEnabledChange(profile.id, !enabled)
  })

  const add = (event: FormEvent) => {
    event.preventDefault()
    if (!profile || !subjectId) return
    void run(async () => { await addAdhdTask(profile.id, day, subjectId, note, tasks.length); setNote('') })
  }

  const copyPrevious = () => run(async () => {
    if (!profile) return
    const count = await copyAdhdTasks(profile.id, shiftDay(day, -1), day)
    if (!count) setError('Önceki günde kopyalanacak ders yok.')
  })

  return (
    <dialog ref={dialog} className="admin-password-dialog adhd-admin-dialog" aria-labelledby="adhd-admin-title" onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === event.currentTarget) close() }}>
      <div className="admin-password-heading">
        <div><h2 id="adhd-admin-title">DEHB modu</h2><p>{profileNameLabel(profile?.display_name, profile?.email)}</p></div>
        <button type="button" onClick={close} disabled={busy} aria-label="Kapat"><X size={19} /></button>
      </div>

      <button type="button" role="switch" aria-checked={enabled} onClick={() => void toggle()} disabled={busy} className={`adhd-admin-switch ${enabled ? 'is-on' : ''}`}>
        <span className="adhd-admin-switch-track" aria-hidden="true"><span /></span>
        <span><strong>{enabled ? 'DEHB modu açık' : 'DEHB modu kapalı'}</strong><small>Açıkken kullanıcı yalnızca o günün derslerini ve kronometreyi görür. 1 dakika çalışılan ders yapıldı sayılır.</small></span>
      </button>

      <div className="adhd-admin-day">
        <button type="button" onClick={() => setDay(shiftDay(day, -1))} aria-label="Önceki gün"><ChevronLeft size={18} /></button>
        <label><span className="sr-only">Gün seç</span><input type="date" value={day} onChange={event => event.target.value && setDay(event.target.value)} /></label>
        <button type="button" onClick={() => setDay(shiftDay(day, 1))} aria-label="Sonraki gün"><ChevronRight size={18} /></button>
      </div>
      <p className="adhd-admin-daylabel">{dayLabel(day)}</p>

      <form className="adhd-admin-add" onSubmit={add}>
        <select value={subjectId} onChange={event => setSubjectId(event.target.value)} aria-label="Ders" disabled={!subjects.length || busy}>
          {!subjects.length && <option value="">Bu kullanıcının dersi yok</option>}
          {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
        <input value={note} onChange={event => setNote(event.target.value)} maxLength={200} placeholder="Kısa not (isteğe bağlı) · ör. 20 soru çöz" aria-label="Not" disabled={busy} />
        <button type="submit" disabled={!subjectId || busy}><Plus size={17} /> Ekle</button>
      </form>

      <div className="adhd-admin-list" aria-busy={loading}>
        {loading && !tasks.length ? <p className="adhd-admin-empty">Yükleniyor…</p>
          : !tasks.length ? <div className="adhd-admin-empty"><p>Bu gün için ders yok.</p><button type="button" onClick={() => void copyPrevious()} disabled={busy}><Copy size={15} /> Önceki günü kopyala</button></div>
          : <ol>{tasks.map((task, index) => (
            <li key={task.id} className={task.completed_at ? 'is-done' : ''}>
              <span className="adhd-admin-index">{task.completed_at ? <Check size={14} /> : index + 1}</span>
              <span className="adhd-admin-text"><strong>{task.subjects?.name || 'Ders'}</strong><small>{[task.note, task.completed_at ? `Yapıldı · ${minutesLabel(task.studied_seconds, 'çalışıldı')}` : task.studied_seconds ? minutesLabel(task.studied_seconds, 'çalışıldı') : ''].filter(Boolean).join(' · ') || 'Bekliyor'}</small></span>
              <span className="adhd-admin-actions">
                <button type="button" onClick={() => void run(() => moveAdhdTask(tasks, index, -1))} disabled={busy || index === 0} aria-label="Yukarı taşı"><ArrowUp size={15} /></button>
                <button type="button" onClick={() => void run(() => moveAdhdTask(tasks, index, 1))} disabled={busy || index === tasks.length - 1} aria-label="Aşağı taşı"><ArrowDown size={15} /></button>
                <button type="button" onClick={() => void run(() => deleteAdhdTask(task.id))} disabled={busy} aria-label={`${task.subjects?.name || 'Dersi'} sil`} className="is-danger"><Trash2 size={15} /></button>
              </span>
            </li>
          ))}</ol>}
      </div>

      {error && <p className="admin-password-error" role="alert">{error}</p>}
    </dialog>
  )
})

export default AdhdPlanDialog
