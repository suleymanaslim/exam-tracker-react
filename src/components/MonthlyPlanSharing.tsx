import { useEffect, useRef, useState } from 'react'
import { CalendarDays, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { profileNameLabel } from '../lib/profileName'
import { monthlyPlanAccessError, notifyMonthlyPlanAccessChanged } from '../lib/monthlyPlanAccess'
import './MonthlyPlanSharing.css'

interface Profile { id: string; display_name: string | null; email: string | null }
export default function MonthlyPlanSharing({ profiles }: { profiles: Profile[] }) {
  const [ownerId, setOwnerId] = useState('')
  const [viewers, setViewers] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState('')
  const [message, setMessage] = useState('')
  const [retry, setRetry] = useState(0)
  const mounted = useRef(false), pending = useRef(false)
  useEffect(() => {
    mounted.current = true
    let active = true
    void (async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) throw authError || new Error('Oturum yok')
        const { data, error } = await supabase.from('monthly_plan_viewers').select('viewer_id').eq('plan_owner_id', user.id)
        if (error) throw error
        if (active) { setOwnerId(user.id); setViewers((data || []).map(row => row.viewer_id)); setError(''); setReady(true) }
      } catch (error) { if (active) setError(monthlyPlanAccessError(error)) }
    })()
    return () => { active = false; mounted.current = false }
  }, [retry])
  const change = async (profile: Profile, allowed: boolean) => {
    if (!ready || pending.current) return
    pending.current = true; setSaving(profile.id); setError(''); setMessage('')
    try {
      const { data, error } = await supabase.rpc('set_monthly_plan_viewer', { p_viewer_id: profile.id, p_allowed: allowed })
      if (error) throw error
      if (data?.viewer_id !== profile.id || data?.allowed !== allowed) throw new Error('İzin doğrulanamadı.')
      if (mounted.current) {
        setViewers(previous => allowed ? [...new Set([...previous, profile.id])] : previous.filter(id => id !== profile.id))
        setMessage(`${profileNameLabel(profile.display_name, profile.email)} için görüntüleme ${allowed ? 'açıldı' : 'kapatıldı'}.`)
      }
      notifyMonthlyPlanAccessChanged()
    } catch (error) { if (mounted.current) setError(monthlyPlanAccessError(error)) }
    finally { pending.current = false; if (mounted.current) setSaving('') }
  }
  return <section className="monthly-sharing" aria-labelledby="monthly-sharing-title" aria-busy={!ready && !error || !!saving}>
    <header><CalendarDays size={18} /><h2 id="monthly-sharing-title">Aylık planı kimler görebilir?</h2></header>
    <p>Seçtiğin kişiler senin aylık planını görüntüler. Düzenleme yetkisi sende kalır.</p>
    {!ready && !error && <p role="status">İzinler yükleniyor…</p>}
    {error && <div className="monthly-sharing-error" role="alert"><span>{error}</span><button type="button" disabled={!!saving} onClick={() => { setReady(false); setError(''); setRetry(value => value + 1) }}><RefreshCw size={14} /> Tekrar dene</button></div>}
    <div className="monthly-sharing-users">{profiles.filter(profile => profile.id !== ownerId).map(profile => <label key={profile.id}>
      <span><strong>{profileNameLabel(profile.display_name, profile.email)}</strong><small>{saving === profile.id ? 'Kaydediliyor…' : viewers.includes(profile.id) ? 'Görüntüleme açık' : 'Görüntüleme kapalı'}</small></span>
      <input type="checkbox" role="switch" aria-label={`${profileNameLabel(profile.display_name, profile.email)} için aylık planı göster`} checked={viewers.includes(profile.id)} disabled={!ready || !!saving} onChange={event => void change(profile, event.target.checked)} />
    </label>)}</div>
    {message && <p className="monthly-sharing-success" role="status">{message}</p>}
  </section>
}
