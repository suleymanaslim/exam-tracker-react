import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarRange, Check, X } from 'lucide-react'
import { localDayKey } from '../lib/statsPeriod'
import { profileNameLabel } from '../lib/profileName'
import { adhdError, minutesLabel, readAdhdTasks, setAdhdEnabled } from '../lib/adhdMode'
import type { AdhdTask } from '../lib/adhdMode'

interface Profile { id: string; display_name: string | null; email: string | null }
export interface AdhdPlanDialogHandle { open: (profile: Profile, enabled: boolean, trigger: HTMLElement) => void }

/** Admin panelindeki küçük pencere: DEHB modunu aç/kapat, bugünü gör, haftalık plana geç. */
const AdhdPlanDialog = forwardRef<AdhdPlanDialogHandle, { onEnabledChange: (userId: string, enabled: boolean) => void }>(function AdhdPlanDialog({ onEnabledChange }, ref) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [tasks, setTasks] = useState<AdhdTask[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useImperativeHandle(ref, () => ({
    open(next, isEnabled, from) {
      trigger.current = from
      setProfile(next); setEnabled(isEnabled); setError(''); setTasks([])
      dialog.current?.showModal()
    },
  }), [])

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    try { setTasks(await readAdhdTasks(profile.id, localDayKey(new Date()))) } catch (loadError) { setError(adhdError(loadError)) } finally { setLoading(false) }
  }, [profile])
  useEffect(() => { void load() }, [load])

  const close = () => { if (busy) return; dialog.current?.close(); setProfile(null); trigger.current?.focus() }

  const toggle = async () => {
    if (!profile || busy) return
    setBusy(true); setError('')
    try { await setAdhdEnabled(profile.id, !enabled); setEnabled(!enabled); onEnabledChange(profile.id, !enabled) }
    catch (toggleError) { setError(adhdError(toggleError)) }
    finally { setBusy(false) }
  }

  const openWeek = () => {
    if (!profile || busy) return
    const id = profile.id
    dialog.current?.close(); setProfile(null)
    navigate(`/adhd-plan?user=${id}`)
  }

  return (
    <dialog ref={dialog} className="admin-password-dialog adhd-admin-dialog" aria-labelledby="adhd-admin-title" onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === event.currentTarget) close() }}>
      <div className="admin-password-heading">
        <div><h2 id="adhd-admin-title">DEHB modu</h2><p>{profileNameLabel(profile?.display_name, profile?.email)}</p></div>
        <button type="button" onClick={close} disabled={busy} aria-label="Kapat"><X size={19} /></button>
      </div>

      <button type="button" role="switch" aria-checked={enabled} onClick={() => void toggle()} disabled={busy} className={`adhd-admin-switch ${enabled ? 'is-on' : ''}`}>
        <span className="adhd-admin-switch-track" aria-hidden="true"><span /></span>
        <span><strong>{enabled ? 'DEHB modu açık' : 'DEHB modu kapalı'}</strong><small>Açıkken kişi yalnızca o günün derslerini ve konularını, bir de kronometreyi görür. 1 dakika çalışılan ders yapıldı sayılır.</small></span>
      </button>

      <button type="button" className="adhd-admin-weekbutton" onClick={openWeek}><CalendarRange size={18} aria-hidden="true" /> Haftalık planı aç<small>Ders + konu ekle, kopyala-yapıştır, setler</small></button>

      <h3 className="adhd-admin-subtitle">Bugün</h3>
      <div className="adhd-admin-list" aria-busy={loading}>
        {loading && !tasks.length ? <p className="adhd-admin-empty">Yükleniyor…</p>
          : !tasks.length ? <p className="adhd-admin-empty">Bugün için ders yok.</p>
          : <ol>{tasks.map((task, index) => (
            <li key={task.id} className={task.completed_at ? 'is-done' : ''}>
              <span className="adhd-admin-index">{task.completed_at ? <Check size={14} /> : index + 1}</span>
              <span className="adhd-admin-text">
                <strong>{task.subjects?.name || 'Ders'}{task.topic_title ? ` · ${task.topic_title}` : ''}</strong>
                <small>{[task.topic_completed_at ? 'Konu bitti' : '', task.note, task.completed_at ? `Yapıldı · ${minutesLabel(task.studied_seconds, 'çalışıldı')}` : 'Bekliyor'].filter(Boolean).join(' · ')}</small>
              </span>
            </li>
          ))}</ol>}
      </div>
      {error && <p className="admin-password-error" role="alert">{error}</p>}
    </dialog>
  )
})

export default AdhdPlanDialog
