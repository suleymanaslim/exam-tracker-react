import './QuestionProgress.css'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BookOpenCheck, ChevronRight } from 'lucide-react'
import { useQuestionData } from '../lib/useQuestionData'
import { analyzeQuestions } from '../lib/questionAnalytics'

const number = (count: number) => count.toLocaleString('tr-TR')
export default function QuestionProgress({ week, compact = false }: { week: string | null; compact?: boolean }) {
  const source = useQuestionData()
  const data = useMemo(() => analyzeQuestions(source.plans, source.logs, week), [source.plans, source.logs, week])
  const max = Math.max(1, ...data.buckets.map(b => b.solved))
  return <section className={`question-stat ${compact ? 'is-compact' : ''}`} aria-label="Soru çözüm istatistikleri">
    <header><h2><BookOpenCheck size={19} /> {compact ? 'Bu haftanın soru hedefi' : 'Soru çözümü'}</h2><Link to="/questions">Soru planı <ChevronRight size={15} /></Link></header>
    {source.loading ? <p className="question-stat-state" role="status">Sorular yükleniyor…</p> : source.error ? <div className="question-stat-state" role="status"><span>{source.error}</span><button onClick={source.retry}>Tekrar dene</button></div> : <>
      <div className="question-stat-values">{[
        ['Çözülen', number(data.solved)], ['Hedef', data.target ? number(data.target) : '—'],
        ['Kalan', data.target ? number(data.remaining) : '—'],
        compact ? ['Bugün çözülen', number(data.today)] : ['Hedef ilerlemesi', data.progress == null ? '—' : `%${data.progress}`],
      ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      {data.target > 0 && <div className="question-stat-meter" role="progressbar" aria-label="Soru hedefi ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.progress || 0}><i style={{ width: `${data.progress || 0}%` }} /></div>}
      {!compact && <div className="question-stat-details"><div><h3>{week ? 'Günlük çözülen sorular' : 'Son 12 hafta'}{week && data.previous != null && <span>{data.solved - data.previous >= 0 ? '+' : '−'}{number(Math.abs(data.solved - data.previous))} · önceki haftaya göre</span>}</h3><div className="question-stat-bars">{data.buckets.map(bucket => <div key={bucket.key}><strong>{number(bucket.solved)}</strong><div><i style={{ height: `${bucket.solved / max * 100}%` }} /></div><span>{bucket.label}</span></div>)}</div>{!data.selected.length && <p className="question-stat-state">Bu dönemde çözüm kaydı yok.</p>}</div><div className="question-stat-subjects"><h3>Derslere göre soru hedefi</h3>{data.bySubject.length === 0 ? <p className="question-stat-state">Soru planından bir hedef ekleyebilirsin.</p> : data.bySubject.map(row => <div key={row.id}><div><strong>{row.name}</strong><span>{row.target ? `${number(row.remaining)} kalan` : 'Hedef yok'}</span></div><div><strong>{number(row.solved)}{row.target ? ` / ${number(row.target)}` : ''}</strong><span>{[row.correctRecorded ? `${number(row.correct)} doğru` : '', row.wrongRecorded ? `${number(row.wrong)} yanlış` : ''].filter(Boolean).join(' · ') || 'soru'}</span></div></div>)}</div></div>}
    </>}
  </section>
}
