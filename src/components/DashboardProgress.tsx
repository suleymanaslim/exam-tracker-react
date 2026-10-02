import { useState } from 'react'
import { Clock, Flame, Target, TrendingUp } from 'lucide-react'

export interface ProgressDay {
  label: string
  planned: number
  studied: number
  pct: number
  isToday: boolean
}

function formatDuration(minutes: number) {
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / 60)
  return hours ? `${hours} sa${total % 60 ? ` ${total % 60} dk` : ''}` : `${total} dk`
}

export function DashboardSummary({ streak, studied, planned }: { streak: number; studied: number; planned: number }) {
  return <div className="dash-summary">
    {[{label:'Günlük seri',value:`${streak} gün`,icon:Flame},{label:'Bu hafta',value:formatDuration(studied),icon:Clock},{label:'Haftalık hedef',value:planned > 0 ? `%${Math.round(studied / planned * 100)}` : 'Plan yok',icon:Target}].map(({label,value,icon:Icon}) => <div key={label}><span><Icon size={13}/>{label}</span><strong>{value}</strong></div>)}
  </div>
}

export function DailyProgress({ day, regularMinutes, videoMinutes }: { day: ProgressDay; regularMinutes: number; videoMinutes: number }) {
  const percent = day.planned > 0 ? Math.round(day.studied / day.planned * 100) : null
  return <section className="dash-daily" aria-label="Günlük saat takibi">
    <div className="dash-daily-title"><Clock size={16}/><strong>Bugünkü süre</strong></div>
    <div className="dash-daily-values">{[{label:'Çalışılan',value:formatDuration(day.studied)},{label:'Hedef',value:day.planned > 0 ? formatDuration(day.planned) : '—'},{label:'Kalan',value:day.planned > 0 ? formatDuration(Math.max(0,day.planned-day.studied)) : '—'}].map(s=><div key={s.label}><span>{s.label}</span><strong>{s.value}</strong></div>)}</div>
    <div className="dash-daily-progress"><div><span>{percent === null ? 'Plan bekleniyor' : percent >= 100 ? 'Hedef tamamlandı' : 'Günlük ilerleme'}</span><b>{percent === null ? '—' : `%${percent}`}</b></div><div className="dash-track" role="progressbar" aria-label="Günlük hedef ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent ?? 0)}><span style={{width:`${Math.min(100,percent ?? 0)}%`}}/></div></div>
    <details className="dash-daily-source"><summary>Plan detayı</summary><div>Normal plan: {formatDuration(regularMinutes)}<br/>Video planı: {formatDuration(videoMinutes)}</div></details>
  </section>
}

export function WeeklyProgress({ days }: { days: ProgressDay[] }) {
  const [selected, setSelected] = useState(() => Math.max(0, days.findIndex(day => day.isToday)))
  const day = days[selected]
  const maxMinutes = Math.max(60, ...days.flatMap(d => [d.planned, d.studied]))
  return <section className="dash-panel dash-weekly" aria-label="Haftalık ilerleme">
    <div className="dash-section-head"><div><p className="dash-eyebrow">TEMPO</p><h2>Haftalık ilerleme</h2></div><TrendingUp size={18} className="dash-muted"/></div>
    <div className="dash-chart-legend"><span><i/>Çalışılan</span><span><i/>Hedef</span></div>
    <div className="dash-chart">{days.map((d,index)=><button key={d.label} aria-pressed={selected===index} aria-label={`${d.label}${d.isToday?', bugün':''}: ${formatDuration(d.studied)} çalışılan, ${formatDuration(d.planned)} hedef`} onClick={()=>setSelected(index)} className={selected===index?'is-selected':''}>
      <span className="dash-chart-value">{formatDuration(d.studied)}</span><span className="dash-chart-bar"><span style={{height:`${d.planned/maxMinutes*100}%`}}/><span style={{height:`${d.studied/maxMinutes*100}%`}}/></span><span className="dash-chart-day">{d.label}{d.isToday&&<i/>}</span>
    </button>)}</div>
    <div className="dash-chart-detail" aria-live="polite"><strong>{day.label}{day.isToday?' · Bugün':''}</strong><span>{formatDuration(day.studied)} <span className="dash-muted">/ {day.planned ? formatDuration(day.planned) : 'Plan yok'}</span></span></div>
  </section>
}
