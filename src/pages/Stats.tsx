import './Stats.css'
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAdminStore } from '../lib/adminStore'
import { localDayKey, mondayOf, weekBounds } from '../lib/statsPeriod'
import { analyzeStudy, minutesLabel, type StudyRecord } from '../lib/studyAnalytics'
interface Subject { id: string; exam_id: string; name: string }
interface Exam { id: string; name: string; color: string }
export default function Stats() {
  const [sessions, setSessions] = useState<StudyRecord[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [period, setPeriod] = useState<'all' | 'week'>('all')
  const [week, setWeek] = useState(() => localDayKey(mondayOf(new Date())))
  const { impersonatedUserId } = useAdminStore()
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    async function load() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) throw new Error('Oturum bulunamadı.')
        const uid = impersonatedUserId || user.id
        const readSessions = async () => {
          const rows: StudyRecord[] = []
          for (let page = 0; ; page++) {
            const response = await supabase.from('study_sessions').select('id,subject_id,duration_minutes,started_at').eq('user_id', uid).order('id').range(page * 1000, page * 1000 + 999)
            if (response.error) throw response.error
            rows.push(...response.data)
            if (response.data.length < 1000) return rows
            if (!active) return []
          }
        }
        const [records, s, e] = await Promise.all([readSessions(), supabase.from('subjects').select('id,exam_id,name').eq('user_id', uid), supabase.from('exams').select('id,name,color').eq('user_id', uid)])
        if (s.error || e.error) throw s.error || e.error
        if (active) { setSessions(records); setSubjects(s.data || []); setExams(e.data || []) }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'İstatistikler yüklenemedi.') }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [impersonatedUserId, retry])
  const data = useMemo(() => analyzeStudy(sessions, period === 'week' ? week : null), [sessions, period, week])
  const { start, end } = weekBounds(week)
  const last = new Date(end); last.setDate(last.getDate() - 1)
  const date = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
  const shift = (direction: number) => { const next = new Date(start); next.setDate(next.getDate() + direction * 7); setWeek(localDayKey(next)) }
  const max = Math.max(1, ...data.buckets.map(b => b.minutes))
  const difference = data.previous === null ? null : data.total - data.previous
  if (loading) return <div className="analytics-state" role="status">İstatistikler yükleniyor…</div>
  if (error) return <div className="analytics-state" role="alert"><p>{error}</p><button onClick={() => setRetry(r => r + 1)}>Tekrar dene</button></div>
  return <main className="analytics">
    <header className="analytics-header"><h1><BarChart3 size={24} /> İstatistikler</h1><div className="analytics-period" aria-label="Dönem">{(['all', 'week'] as const).map(p => <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>{p === 'all' ? 'Tüm zamanlar' : 'Haftalık'}</button>)}</div></header>
    <div className="analytics-dates"><p aria-live="polite">{period === 'all' ? 'İlk çalışma kaydından bugüne' : `${date(start)} – ${date(last)}`}</p>{period === 'week' && <div><button onClick={() => shift(-1)} aria-label="Önceki hafta"><ChevronLeft size={18} /></button><input type="date" aria-label="Hafta seç" value={week} onChange={e => { if (e.target.value) setWeek(localDayKey(mondayOf(new Date(`${e.target.value}T00:00:00`)))) }} /><button onClick={() => shift(1)} aria-label="Sonraki hafta"><ChevronRight size={18} /></button><button onClick={() => setWeek(localDayKey(mondayOf(new Date())))}>Bu hafta</button></div>}</div>
    <section className="analytics-kpis">{[
      ['Toplam süre', minutesLabel(data.total), period === 'week' && difference !== null && data.days > 0 ? `${difference >= 0 ? '+' : '−'}${minutesLabel(Math.abs(difference))} · önceki haftanın aynı günleri` : `${data.selected.length} oturum`],
      ['Çalışılan gün', `${data.active} / ${data.days}`, 'Geçen takvim günleri'],
      ['Günlük ortalama', minutesLabel(data.dailyAverage), 'Çalışılmayan günler dahil'],
      ['Oturum ortalaması', minutesLabel(data.sessionAverage), `${data.selected.length} kayıtlı oturum`],
    ].map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</section>
    <section className="analytics-card analytics-trend"><h2>{period === 'week' ? 'Günlük çalışma' : 'Son 12 hafta'}<span>{period === 'week' ? '7 gün' : 'Haftalık toplamlar'}</span></h2><div className={`analytics-bars ${period === 'all' ? 'analytics-bars-long' : ''}`}>{data.buckets.map(b => <div className="analytics-bar" key={b.key}><span>{minutesLabel(b.minutes)}</span><div><i style={{ height: `${b.minutes / max * 100}%` }} /></div><strong>{b.label}</strong></div>)}</div></section>
    <div className="analytics-details"><section className="analytics-card"><h2>Ders dağılımı<span>Süre · oturum · pay</span></h2>{data.bySubject.length === 0 ? <p className="analytics-empty">Bu dönemde çalışma kaydı yok.</p> : data.bySubject.map(row => { const subject = subjects.find(s => s.id === row.id); const exam = exams.find(e => e.id === subject?.exam_id); const share = data.total ? row.minutes / data.total * 100 : 0; return <div className="analytics-subject" key={row.id}><div><strong>{subject?.name || 'Ders belirtilmemiş'}</strong><span>{exam?.name || 'Diğer'}</span></div><div><strong>{minutesLabel(row.minutes)}</strong><span>{row.count} oturum · %{Math.round(share)}</span></div><div className="analytics-meter"><i style={{ width: `${share}%`, background: exam?.color || '#4269a8' }} /></div></div> })}</section>
    <section className="analytics-card"><h2>Çalışma saatleri</h2>{['Gece · 00–06', 'Sabah · 06–12', 'Öğle · 12–18', 'Akşam · 18–24'].map((label, i) => <div className="analytics-time" key={label}><div><span>{label}</span><strong>{minutesLabel(data.timeOfDay[i])}</strong></div><div className="analytics-meter"><i style={{ width: `${data.total ? data.timeOfDay[i] / data.total * 100 : 0}%` }} /></div></div>)}<p className="analytics-caption">Oturumun başladığı saate göre</p></section></div>
  </main>
}
