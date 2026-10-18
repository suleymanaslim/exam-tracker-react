import { useEffect, useRef, useState } from 'react'
import { Copy, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { profileNameLabel } from '../lib/profileName'
import { questionWeekDays, questionWeekError } from '../lib/questionWeek'

interface Profile { id: string; display_name: string | null; email: string | null }
interface Props { sourceUserId: string; week: string; onClose: () => void }

export default function CopyQuestionWeekDialog({ sourceUserId, week, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const submitting = useRef(false)
  const mounted = useRef(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ copied: number; skipped: number } | null>(null)
  const days = questionWeekDays(week)
  useEffect(() => {
    mounted.current = true; dialog.current?.showModal()
    void (async () => {
      try {
        const rows: Profile[] = []
        for (let start = 0; ; start += 500) {
          const { data, error } = await supabase.from('profiles').select('id,display_name,email').order('id').range(start, start + 499)
          if (error) throw error
          rows.push(...(data || []))
          if ((data || []).length < 500) break
        }
        if (mounted.current) setProfiles(rows)
      } catch { if (mounted.current) setError('Kullanıcılar yüklenemedi. Pencereyi kapatıp tekrar açabilirsin.') }
      finally { if (mounted.current) setLoading(false) }
    })()
    return () => { mounted.current = false }
  }, [])
  const copy = async () => {
    if (!target || submitting.current || result) return
    submitting.current = true; setBusy(true); setError('')
    try {
      const { data, error } = await supabase.rpc('copy_question_week', { p_source_user_id: sourceUserId, p_target_user_id: target, p_week_start: week })
      if (!mounted.current) return
      if (error) { setError(questionWeekError(error)); return }
      if (!data || !Number.isInteger(data.copied) || !Number.isInteger(data.skipped)) { setError('Kopyalama yanıtı doğrulanamadı. Aynı haftayı tekrar yapıştırmak hedefleri çoğaltmaz.'); return }
      setResult(data)
      window.dispatchEvent(new Event('question-data-changed'))
    } catch { if (mounted.current) setError('Bağlantı kurulamadı. Aynı kullanıcıya tekrar yapıştırabilirsin; hedefler çoğalmaz.') }
    finally { submitting.current = false; if (mounted.current) setBusy(false) }
  }
  const source = profiles.find(profile => profile.id === sourceUserId)
  return <dialog ref={dialog} className="question-copy-dialog" aria-labelledby="question-copy-title" onCancel={event => { if (submitting.current) event.preventDefault(); else onClose() }} onClick={event => { if (event.target === event.currentTarget && !submitting.current) onClose() }}>
    <div className="question-copy-content"><header><div><p>ADMIN · SORU PLANI</p><h2 id="question-copy-title">Başka kullanıcıya yapıştır</h2></div><button type="button" className="question-icon-button" disabled={busy} aria-label="Kapat" onClick={onClose}><X size={18} /></button></header>
      <p><strong>{source ? profileNameLabel(source.display_name, source.email) : 'Açık hesap'}</strong> · {days[0].date} – {days[6].date}</p>
      <label>Hedef kullanıcı<select value={target} disabled={loading || busy || !!result} onChange={event => { setTarget(event.target.value); setError('') }}><option value="">{loading ? 'Kullanıcılar yükleniyor…' : 'Kullanıcı seç'}</option>{profiles.filter(profile => profile.id !== sourceUserId).map(profile => <option key={profile.id} value={profile.id}>{profileNameLabel(profile.display_name, profile.email)} · {profile.email || profile.id.slice(-8)}</option>)}</select></label>
      <div className="question-copy-note">Aynı ders ve tarihlerde yalnızca soru hedefleri eklenir. Aynı dersin aynı gündeki video hedefleri tek soru hedefinde birleşir. Mevcut hedefler ve çözüm geçmişi korunur.</div>
      {error && <p role="alert" className="question-panel-error">{error}</p>}
      {result && <p role="status" className="question-panel-success">{result.copied} hedef eklendi. {result.skipped} mevcut hedef korundu.</p>}
      <footer><button type="button" className="question-button is-secondary" disabled={busy} onClick={onClose}>{result ? 'Tamam' : 'Vazgeç'}</button>{!result && <button type="button" className="question-button" disabled={loading || busy || !target} onClick={() => void copy()}><Copy size={16} />{busy ? 'Yapıştırılıyor…' : 'Seçili haftayı yapıştır'}</button>}</footer>
    </div>
  </dialog>
}
