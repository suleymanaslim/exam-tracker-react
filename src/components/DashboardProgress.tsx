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
  const percent = planned > 0 ? Math.round(studied / planned * 100) : null
  return (
    <div className="grid grid-cols-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm divide-x divide-slate-100">
      {[
        { label: 'Günlük seri', value: `${streak} gün`, icon: Flame, color: 'text-orange-500' },
        { label: 'Bu hafta', value: formatDuration(studied), icon: Clock, color: 'text-blue-600' },
        { label: 'Haftalık hedef', value: percent === null ? 'Plan yok' : `%${percent}`, icon: Target, color: 'text-emerald-600' },
      ].map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="min-w-0 px-2 py-1 sm:px-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500"><Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} /><span>{label}</span></div>
          <p className="mt-1 text-xs sm:text-sm font-bold tabular-nums text-slate-900">{value}</p>
        </div>
      ))}
    </div>
  )
}

export function DailyProgress({ day, regularMinutes, videoMinutes }: { day: ProgressDay; regularMinutes: number; videoMinutes: number }) {
  const percent = day.planned > 0 ? Math.round(day.studied / day.planned * 100) : null
  return (
    <section aria-label="Günlük saat takibi" className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><span className="rounded-lg bg-blue-100 p-2 text-blue-600"><Clock className="h-4 w-4" /></span>Bugünün çalışma süresi</h2>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">{percent === null ? 'Günlük hedef yok' : percent >= 100 ? 'Hedef tamamlandı' : `%${percent} tamamlandı`}</span>
      </div>
      <div className="my-4 grid grid-cols-3 gap-3">
        {[{ label: 'Çalışılan', value: formatDuration(day.studied) }, { label: 'Günlük hedef', value: day.planned > 0 ? formatDuration(day.planned) : '—' }, { label: 'Kalan', value: day.planned > 0 ? formatDuration(Math.max(0, day.planned - day.studied)) : '—' }].map(stat => (
          <div key={stat.label}><p className="text-[11px] sm:text-xs text-slate-500">{stat.label}</p><p className="mt-1 text-sm sm:text-xl font-bold tracking-tight tabular-nums text-slate-900">{stat.value}</p></div>
        ))}
      </div>
      <div role="progressbar" aria-label="Günlük hedef ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(percent ?? 0, 100)} className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${percent !== null && percent >= 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(percent ?? 0, 100)}%` }} />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Normal plan: <span className="font-semibold text-slate-700">{formatDuration(regularMinutes)}</span><span className="mx-2">·</span>Video planı: <span className="font-semibold text-slate-700">{formatDuration(videoMinutes)}</span></p>
      {day.planned === 0 && <p className="mt-1 text-xs text-slate-500">Bugüne plan eklediğinde hedefin burada görünür.</p>}
    </section>
  )
}

export function WeeklyProgress({ days }: { days: ProgressDay[] }) {
  const [selected, setSelected] = useState(() => Math.max(0, days.findIndex(day => day.isToday)))
  const day = days[selected]
  const maxMinutes = Math.max(60, ...days.flatMap(d => [d.planned, d.studied]))
  return (
    <section aria-label="Haftalık ilerleme" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><TrendingUp className="h-4 w-4 text-blue-600" />Haftalık ilerleme</h2>
        <div className="flex gap-3 text-[10px] text-slate-500"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-blue-600" />Çalışılan</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-slate-200" />Hedef</span></div>
      </div>
      <div className="mt-5 grid grid-cols-7 gap-1">
        {days.map((d, index) => (
          <button key={d.label} onClick={() => setSelected(index)} aria-pressed={selected === index} aria-label={`${d.label}${d.isToday ? ', bugün' : ''}: ${formatDuration(d.studied)} çalışılan, ${formatDuration(d.planned)} hedef`} className={`min-w-0 rounded-lg px-0.5 py-2 text-center transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${selected === index ? 'bg-blue-50 ring-1 ring-blue-100' : 'hover:bg-slate-50'}`}>
            <span className="mb-2 flex h-8 items-center justify-center text-[10px] sm:text-[11px] font-semibold leading-tight tabular-nums text-slate-700">{formatDuration(d.studied)}</span>
            <span className="relative mx-auto block h-20 w-full max-w-8">
              <span className="absolute inset-x-0 bottom-0 rounded-t-md bg-slate-200" style={{ height: `${d.planned / maxMinutes * 100}%` }} />
              <span className={`absolute inset-x-1 bottom-0 rounded-t-md ${d.planned > 0 && d.studied >= d.planned ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ height: `${d.studied / maxMinutes * 100}%` }} />
            </span>
            <span className={`mt-2 block text-[11px] font-semibold ${d.isToday ? 'text-blue-700' : 'text-slate-500'}`}>{d.label}</span>
            <span className="mt-1 flex h-1 justify-center">{d.isToday && <span className="h-1 w-1 rounded-full bg-blue-600" />}</span>
          </button>
        ))}
      </div>
      <div aria-live="polite" className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500"><span className="font-bold text-slate-900">{day.label}{day.isToday ? ' · Bugün' : ''}</span><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1"><span>Çalışılan <b className="text-blue-700">{formatDuration(day.studied)}</b></span><span>Hedef <b className="text-slate-700">{day.planned > 0 ? formatDuration(day.planned) : 'Plan yok'}</b></span></div></div>
    </section>
  )
}
