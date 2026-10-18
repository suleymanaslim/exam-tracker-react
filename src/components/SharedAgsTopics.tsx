import { useCallback, useEffect, useRef, useState } from 'react'
import { BookMarked, Check, ChevronDown, Pencil, Plus, RefreshCw, Trash2, Users } from 'lucide-react'
import Swal from 'sweetalert2'
import { supabase } from '../lib/supabase'
import { fetchSharedTopics } from '../lib/sharedTopicsData'
import { readTopicTitles, sharedTopicsError } from '../lib/monthlyTopics'
import type { SharedSubject, SharedTopic, SharedTopicProgress } from '../lib/monthlyTopics'
import '../pages/MonthlyPlan.css'

export default function SharedAgsTopics({ userId, canManage }: { userId: string; canManage: boolean }) {
  const [subjects, setSubjects] = useState<SharedSubject[]>([])
  const [topics, setTopics] = useState<SharedTopic[]>([])
  const [progress, setProgress] = useState<SharedTopicProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [subjectId, setSubjectId] = useState('')
  const [titles, setTitles] = useState('')
  const mounted = useRef(false), submitting = useRef(false), version = useRef(0)
  const load = useCallback(async () => {
    const request = ++version.current
    try {
      const data = await fetchSharedTopics(supabase, userId)
      if (!mounted.current || request !== version.current) return
      setSubjects(data.subjects); setTopics(data.topics); setProgress(data.progress); setError('')
      setSubjectId(previous => previous || data.subjects[0]?.id || '')
    } catch (error) { if (mounted.current && request === version.current) { const message = sharedTopicsError(error); setError(!canManage && message.includes('shared_ags_topics_monthly.sql') ? 'Ortak AGS konu listesi henüz etkinleştirilmedi.' : message) } }
    finally { if (mounted.current && request === version.current) setLoading(false) }
  }, [userId, canManage])
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; version.current++ } }, [load])
  const run = async (name: string, args?: Record<string, unknown>) => {
    if (submitting.current || !mounted.current) return false
    submitting.current = true; setBusy(true); setError('')
    try {
      const { error } = await supabase.rpc(name, args)
      if (error) throw error
      if (!mounted.current) return false
      window.dispatchEvent(new Event('topics-changed'))
      await load(); return true
    } catch (error) { if (mounted.current) setError(sharedTopicsError(error)); return false }
    finally { submitting.current = false; if (mounted.current) setBusy(false) }
  }
  const rename = async (kind: 'subject' | 'topic', id?: string, old = '', parent?: string) => {
    const result = await Swal.fire({ title: kind === 'subject' ? id ? 'Ortak ders adını düzenle' : 'Ortak ders ekle' : 'Ortak konu adını düzenle', input: 'text', inputValue: old, inputAttributes: { maxlength: kind === 'subject' ? '200' : '500' }, text: 'Başlık tüm kullanıcılar için güncellenir.', showCancelButton: true, cancelButtonText: 'Vazgeç', confirmButtonText: 'Kaydet', confirmButtonColor: '#4269a8', inputValidator: value => !value.trim() ? 'Bir başlık yaz.' : undefined })
    if (!result.isConfirmed || !mounted.current) return
    await run(kind === 'subject' ? 'save_ags_shared_subject' : 'save_ags_shared_topics', kind === 'subject' ? { p_name: result.value, p_subject_id: id || null } : { p_subject_id: parent, p_topic_id: id, p_titles: [result.value] })
  }
  const archive = async (topic: SharedTopic) => {
    const result = await Swal.fire({ title: 'Ortak listeden kaldırılsın mı?', text: `${topic.title} herkeste gizlenir. Tamamlanma durumları ve aylık plan bağlantıları korunur.`, icon: 'question', showCancelButton: true, confirmButtonText: 'Listeden kaldır', cancelButtonText: 'Vazgeç', confirmButtonColor: '#b94646' })
    if (result.isConfirmed && mounted.current) await run('archive_ags_shared_topic', { p_topic_id: topic.id })
  }
  const publish = async () => {
    const result = await Swal.fire({ title: 'Mevcut AGS konularını paylaş', text: 'Kendi hesabındaki AGS konu başlıkları ortak listeye eklenir. Aynı başlıklar çoğaltılmaz; kişisel tamamlanma işaretleri aktarılmaz.', icon: 'question', showCancelButton: true, confirmButtonText: 'Başlıkları paylaş', cancelButtonText: 'Vazgeç', confirmButtonColor: '#4269a8' })
    if (result.isConfirmed && mounted.current) await run('publish_existing_ags_topics')
  }
  const add = async () => {
    try {
      const values = readTopicTitles(titles)
      if (await run('save_ags_shared_topics', { p_subject_id: subjectId, p_titles: values })) setTitles('')
    } catch (error) { setError((error as Error).message) }
  }
  const active = topics.filter(topic => !topic.archived_at)
  const done = new Set(progress.filter(row => row.is_completed).map(row => row.topic_id))
  return <section className="shared-ags-panel" aria-busy={loading || busy}>
    <header className="shared-ags-heading"><div><p className="monthly-eyebrow"><Users size={13} /> HERKESE ORTAK TEMEL LİSTE</p><h2>AGS konu takibi</h2><p>Başlıklar ortak, tamamlanma işaretlerin sana özel.</p></div>{canManage && <button type="button" className="monthly-button" disabled={loading || busy || !!error} aria-pressed={editing} onClick={() => setEditing(value => !value)}><Pencil size={15} />{editing ? 'Düzenlemeyi kapat' : 'Ortak listeyi düzenle'}</button>}</header>
    {error && <div className="monthly-error" role="alert">{error}<button type="button" className="monthly-button" disabled={busy} onClick={() => void load()}><RefreshCw size={14} /> Tekrar dene</button></div>}
    {loading ? <p className="monthly-muted">Ortak konular yükleniyor…</p> : <>
      {canManage && editing && !error && <div className="shared-ags-editor"><div className="shared-ags-editor-actions"><button type="button" className="monthly-button" disabled={busy} onClick={() => void rename('subject')}><Plus size={15} /> Ders ekle</button><button type="button" className="monthly-button is-quiet" disabled={busy} onClick={() => void publish()}>Mevcut AGS konularımı paylaş</button></div><label>Ders<select value={subjectId} disabled={busy} onChange={event => setSubjectId(event.target.value)}>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>Konu başlıkları<textarea rows={5} value={titles} disabled={busy} onChange={event => setTitles(event.target.value)} placeholder="Her satıra bir konu yaz…" /></label><button type="button" className="monthly-button is-primary" disabled={busy || !subjectId || !titles.trim()} onClick={() => void add()}><Plus size={15} />{busy ? 'Kaydediliyor…' : 'Ortak listeye ekle'}</button></div>}
      <div className="shared-ags-total"><BookMarked size={15} /><strong>{active.filter(topic => done.has(topic.id)).length} / {active.length}</strong><span>konu tamamlandı</span></div>
      {!active.length && <p className="monthly-muted">AGS temel konu başlıkları hazırlanıyor.</p>}
      {subjects.map(subject => {
        const rows = active.filter(topic => topic.subject_id === subject.id)
        return <section className="shared-ags-subject" key={subject.id}><header><button type="button" onClick={() => setOpen(open === subject.id ? null : subject.id)} aria-expanded={open === subject.id}><strong>{subject.name}</strong><span>{rows.filter(topic => done.has(topic.id)).length}/{rows.length}</span><ChevronDown size={15} className={open === subject.id ? 'is-open' : ''} /></button>{canManage && editing && <button type="button" className="monthly-icon" disabled={busy} aria-label={`${subject.name} adını düzenle`} onClick={() => void rename('subject', subject.id, subject.name)}><Pencil size={14} /></button>}</header>{open === subject.id && <div className="shared-ags-rows">{!rows.length && <p className="monthly-muted">Henüz konu eklenmemiş.</p>}{rows.map(topic => <article key={topic.id}><button type="button" className={`shared-topic-check ${done.has(topic.id) ? 'is-done' : ''}`} role="checkbox" aria-checked={done.has(topic.id)} aria-label={`${topic.title} tamamlandı`} disabled={busy || !!error} onClick={() => void run('set_ags_topic_completion', { p_user_id: userId, p_topic_id: topic.id, p_completed: !done.has(topic.id) })}><span>{done.has(topic.id) && <Check size={13} />}</span><strong>{topic.title}</strong></button>{canManage && editing && <div><button type="button" className="monthly-icon" disabled={busy} aria-label="Ortak konu adını düzenle" onClick={() => void rename('topic', topic.id, topic.title, subject.id)}><Pencil size={14} /></button><button type="button" className="monthly-icon is-danger" disabled={busy} aria-label="Ortak konuyu listeden kaldır" onClick={() => void archive(topic)}><Trash2 size={14} /></button></div>}</article>)}</div>}</section>
      })}
    </>}
  </section>
}
