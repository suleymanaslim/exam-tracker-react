import './SuitePages.css'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  Calendar as CalendarIcon, Flame, ChevronLeft, ChevronRight, Target, BookOpen, Trophy, Zap, Sun, BarChart3
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts'
import { useAdminStore } from '../lib/adminStore'
import { localDayKey, mondayOf, weekBounds, sessionsInWeek, studyTrend } from '../lib/statsPeriod'

interface Session { id: string; subject_id: string; duration_minutes: number; started_at: string }
interface Subject { id: string; exam_id: string; name: string }
interface Exam { id: string; name: string; color: string }

export default function Stats() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'all' | 'week'>('all')
  const [selectedWeek, setSelectedWeek] = useState(() => localDayKey(mondayOf(new Date())))
  const { impersonatedUserId } = useAdminStore()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const targetUid = impersonatedUserId || user.id
        Promise.all([
          supabase.from('study_sessions').select('id, subject_id, duration_minutes, started_at').eq('user_id', targetUid),
          supabase.from('subjects').select('*').eq('user_id', targetUid),
          supabase.from('exams').select('*').eq('user_id', targetUid)
        ]).then(([r1, r2, r3]) => {
          if (r1.data) setSessions(r1.data)
          if (r2.data) setSubjects(r2.data)
          if (r3.data) setExams(r3.data)
          setLoading(false)
        })
      }
    })
  }, [impersonatedUserId])

  const subjectToExam = useMemo(() => {
    const map: Record<string, string> = {}
    subjects.forEach(s => { map[s.id] = s.exam_id })
    return map
  }, [subjects])

  const periodSessions = useMemo(() => period === 'all' ? sessions : sessionsInWeek(sessions, selectedWeek), [sessions, period, selectedWeek])
  const totalMinutes = periodSessions.reduce((sum, session) => sum + session.duration_minutes, 0)
  const totalHours = Math.floor(totalMinutes / 60)
  const safeActiveDays = new Set(periodSessions.map(session => localDayKey(new Date(session.started_at)))).size
  const dailyAverage = safeActiveDays > 0 ? Math.round(totalMinutes / safeActiveDays) : 0
  const trendData = useMemo(() => studyTrend(periodSessions, period === 'week' ? selectedWeek : null), [periodSessions, period, selectedWeek])
  const { start: weekStart, end: weekEnd } = weekBounds(selectedWeek)
  const lastDay = new Date(weekEnd)
  lastDay.setDate(lastDay.getDate() - 1)
  const dateLabel = (date: Date) => date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
  const periodLabel = period === 'all' ? 'Tüm zamanlar' : `${dateLabel(weekStart)} – ${dateLabel(lastDay)}`
  const shiftWeek = (direction: number) => {
    const date = new Date(weekStart)
    date.setDate(date.getDate() + direction * 7)
    setSelectedWeek(localDayKey(date))
  }

  // --- Sınav Dağılımı (Donut Chart) ---
  const examData = useMemo(() => {
    const map: Record<string, number> = {}
    exams.forEach(e => { map[e.id] = 0 })
    periodSessions.forEach(s => {
      const eid = subjectToExam[s.subject_id]
      if (eid) map[eid] = (map[eid] ?? 0) + s.duration_minutes
    })
    return exams.map(e => ({
      name: e.name,
      minutes: map[e.id] ?? 0,
      color: e.color,
    })).filter(e => e.minutes > 0).sort((a, b) => b.minutes - a.minutes)
  }, [periodSessions, subjects, exams, subjectToExam])

  // --- En Çok Çalışılan Dersler (Bar List) ---
  const subjectData = useMemo(() => {
    const map: Record<string, number> = {}
    periodSessions.forEach(s => {
      if (s.subject_id) map[s.subject_id] = (map[s.subject_id] ?? 0) + s.duration_minutes
    })
    return Object.entries(map)
      .map(([id, mins]) => {
        const sub = subjects.find(sb => sb.id === id)
        const ex = exams.find(e => e.id === sub?.exam_id)
        return { name: sub?.name ?? 'Bilinmeyen', minutes: mins, color: ex?.color ?? '#cbd5e1' }
      })
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5) // Top 5
  }, [periodSessions, subjects, exams])
  
  const maxSubjectMin = Math.max(...subjectData.map(s => s.minutes), 1)

  // --- Zaman Dilimi Verimliliği (Radar Chart) ---
  const timeOfDayData = useMemo(() => {
    let morning = 0, afternoon = 0, evening = 0, night = 0
    periodSessions.forEach(s => {
      const hour = new Date(s.started_at).getHours()
      if (hour >= 6 && hour < 12) morning += s.duration_minutes
      else if (hour >= 12 && hour < 18) afternoon += s.duration_minutes
      else if (hour >= 18 && hour < 24) evening += s.duration_minutes
      else night += s.duration_minutes
    })
    return [
      { subject: 'Sabah', A: morning },
      { subject: 'Öğle', A: afternoon },
      { subject: 'Akşam', A: evening },
      { subject: 'Gece', A: night },
    ]
  }, [periodSessions])

  const mostProductiveTime = [...timeOfDayData].sort((a, b) => b.A - a.A)[0]

  if (loading) return <div className="h-full flex items-center justify-center text-[#718096]">Yükleniyor...</div>

  return (
    <div className="suite-page suite-stats flex flex-col h-full gap-4 overflow-y-auto pr-2 pb-4">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <p className="suite-eyebrow">VERİLERİNLE İLERLE</p>
          <h1 className="text-2xl font-semibold text-[#24354a] flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-[#4269a8]" /> İstatistikler & Analiz
          </h1>
          <p className="text-[15px] text-[#62748b] mt-1">Çalışma verimini artırmak için performansını detaylı incele.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#e3e9f0] bg-white p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex rounded-xl bg-[#f1f5f9] p-1 self-start" role="group" aria-label="İstatistik dönemi">
          {(['all', 'week'] as const).map(value => (
            <button key={value} onClick={() => setPeriod(value)} aria-pressed={period === value}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${period === value ? 'bg-white text-[#24354a] shadow-sm' : 'text-[#62748b] hover:text-[#24354a]'}`}>
              {value === 'all' ? 'Tüm zamanlar' : 'Haftalık'}
            </button>
          ))}
        </div>
        {period === 'week' && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => shiftWeek(-1)} aria-label="Önceki hafta" className="rounded-lg border border-[#e3e9f0] p-2 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
            <label className="flex items-center gap-2 text-sm text-[#62748b]">
              <span>Hafta seç</span>
              <input type="date" value={selectedWeek} onChange={event => { if (event.target.value) setSelectedWeek(localDayKey(mondayOf(new Date(`${event.target.value}T00:00:00`)))) }}
                className="rounded-lg border border-[#e3e9f0] bg-white px-2 py-1.5 text-[#24354a] min-w-0" />
            </label>
            <button onClick={() => shiftWeek(1)} aria-label="Sonraki hafta" className="rounded-lg border border-[#e3e9f0] p-2 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
            <button onClick={() => setSelectedWeek(localDayKey(mondayOf(new Date())))} className="text-sm font-semibold text-[#4269a8] px-2 py-2">Bu hafta</button>
          </div>
        )}
      </div>
      <p className="text-sm text-[#62748b]" aria-live="polite">{periodLabel} · {periodSessions.length} çalışma kaydı</p>

      {/* Row 1: KPI Kartları */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <div className="rounded-2xl border border-[#e3e9f0] bg-white p-5 hover:shadow-sm transition-all relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-blue-50/50 group-hover:scale-150 transition-all duration-500" />
          <div className="flex items-center justify-between mb-4 relative">
            <h3 className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">Toplam Çalışma</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Trophy className="h-5 w-5" />
            </div>
          </div>
          <div className="relative">
            <p className="text-3xl font-semibold text-[#24354a]">{totalHours}<span className="text-base text-[#718096] font-semibold ml-1">sa</span> {totalMinutes % 60}<span className="text-base text-[#718096] font-semibold ml-1">dk</span></p>
            <p className="text-[13px] font-medium text-[#62748b] mt-1">{periodLabel}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e3e9f0] bg-white p-5 hover:shadow-sm transition-all relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-50/50 group-hover:scale-150 transition-all duration-500" />
          <div className="flex items-center justify-between mb-4 relative">
            <h3 className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">Aktif Gün</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CalendarIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="relative">
            <p className="text-3xl font-semibold text-[#24354a]">{safeActiveDays}<span className="text-base text-[#718096] font-semibold ml-1">gün</span></p>
            <p className="text-[13px] font-medium text-[#62748b] mt-1">Seçilen dönemde çalışılan gün sayısı</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e3e9f0] bg-white p-5 hover:shadow-sm transition-all relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#f5f7fa]/50 group-hover:scale-150 transition-all duration-500" />
          <div className="flex items-center justify-between mb-4 relative">
            <h3 className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">Günlük Ortalama</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5f7fa] text-orange-600">
              <Flame className="h-5 w-5" />
            </div>
          </div>
          <div className="relative">
            <p className="text-3xl font-semibold text-[#24354a]">{Math.floor(dailyAverage / 60)}<span className="text-base text-[#718096] font-semibold ml-1">sa</span> {dailyAverage % 60}<span className="text-base text-[#718096] font-semibold ml-1">dk</span></p>
            <p className="text-[13px] font-medium text-[#62748b] mt-1">Aktif çalışılan {safeActiveDays} gün baz alınarak</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e3e9f0] bg-white p-5 hover:shadow-sm transition-all relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-purple-50/50 group-hover:scale-150 transition-all duration-500" />
          <div className="flex items-center justify-between mb-4 relative">
            <h3 className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">En Verimli Saat</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <Zap className="h-5 w-5" />
            </div>
          </div>
          <div className="relative">
            <p className="text-2xl font-semibold text-[#24354a] break-words">{totalMinutes > 0 ? mostProductiveTime?.subject : 'Henüz veri yok'}</p>
            <p className="text-[13px] font-medium text-[#62748b] mt-1">{(mostProductiveTime?.A || 0) > 0 ? 'Bu zaman diliminde daha iyisin' : 'Henüz veri yok'}</p>
          </div>
        </div>
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:min-h-[300px]">
        {/* 14 Günlük Trend */}
        <div className="col-span-1 lg:col-span-2 rounded-2xl border border-[#e3e9f0] bg-white flex flex-col p-5 min-h-[300px] lg:min-h-0">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-[#24354a] flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-[#4269a8]" /> {period === 'week' ? 'Haftanın Günlük Performansı' : 'Tüm Zamanların Haftalık Performansı'}
            </h3>
          </div>
          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMinutes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4269a8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#4269a8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#62748b' }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fontSize: 12, fill: '#62748b' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}dk`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(val: any) => [`${Math.floor(val/60)} sa ${val%60} dk`, 'Süre']}
                  labelStyle={{ fontWeight: 'bold', color: '#24354a', marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey="minutes" stroke="#4269a8" strokeWidth={3} fillOpacity={1} fill="url(#colorMinutes)" activeDot={{ r: 6, fill: '#4269a8', stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sınav Dağılımı */}
        <div className="col-span-1 rounded-2xl border border-[#e3e9f0] bg-white flex flex-col p-5 min-h-[300px] lg:min-h-0">
          <h3 className="text-sm font-semibold text-[#24354a] mb-2 flex items-center gap-2">
            <Target className="h-4 w-4 text-[#4269a8]" /> Sınav Dağılımı
          </h3>
          <div className="flex-1 relative flex items-center justify-center">
            {totalMinutes === 0 ? (
              <p className="text-[14px] text-[#718096]">Henüz veri yok.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={examData}
                    cx="50%" cy="50%"
                    innerRadius={60} outerRadius={85}
                    paddingAngle={4}
                    dataKey="minutes"
                    stroke="none"
                  >
                    {examData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [`${Math.floor(val / 60)}s ${val % 60}d`, 'Süre']}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            {totalMinutes > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[#718096] text-[12px] font-semibold uppercase tracking-wider">Toplam</span>
                <span className="text-lg font-semibold text-[#24354a] leading-none mt-1">{totalHours}s</span>
              </div>
            )}
          </div>
          <div className="mt-2 space-y-2">
            {examData.map(e => (
              <div key={e.name} className="flex items-center justify-between text-[13px]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: e.color }} />
                  <span className="font-semibold text-[#62748b]">{e.name}</span>
                </div>
                <span className="font-semibold text-[#24354a]">{Math.round((e.minutes / totalMinutes) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Deep Dives */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* En Çok Çalışılan Dersler */}
        <div className="rounded-2xl border border-[#e3e9f0] bg-white p-5">
          <h3 className="text-sm font-semibold text-[#24354a] mb-5 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#4269a8]" /> En Çok Çalışılan Dersler (Top 5)
          </h3>
          <div className="space-y-4">
            {subjectData.length === 0 ? (
              <p className="text-[14px] text-[#718096] text-center py-4">Henüz veri yok.</p>
            ) : (
              subjectData.map((s, i) => (
                <div key={i}>
                  <div className="flex justify-between text-[14px] font-medium mb-1.5">
                    <span className="text-[#24354a] break-words pr-4">{s.name}</span>
                    <span className="text-[#62748b] whitespace-nowrap">{Math.floor(s.minutes / 60)} sa {s.minutes % 60} dk</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#f1f5f9] overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-1000" 
                      style={{ width: `${(s.minutes / maxSubjectMin) * 100}%`, backgroundColor: s.color }} 
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Zaman Dilimi Verimliliği */}
        <div className="rounded-2xl border border-[#e3e9f0] bg-white p-5 flex flex-col">
          <h3 className="text-sm font-semibold text-[#24354a] mb-2 flex items-center gap-2">
            <Sun className="h-4 w-4 text-[#4269a8]" /> Zaman Dilimi Analizi
          </h3>
          <p className="text-[13px] text-[#62748b] mb-4">Hangi saat aralıklarında daha çok odaklandığını gör.</p>
          <div className="flex-1 flex items-center justify-center h-[200px]">
            {totalMinutes === 0 ? (
              <p className="text-[14px] text-[#718096]">Henüz veri yok.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={timeOfDayData}>
                  <PolarGrid stroke="#e3e9f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#62748b', fontWeight: 600 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 'dataMax']} tick={false} axisLine={false} />
                  <Radar name="Süre" dataKey="A" stroke="#8b5cf6" strokeWidth={2} fill="#8b5cf6" fillOpacity={0.3} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(val: any) => [`${Math.floor(val/60)}s ${val%60}d`, 'Çalışma']}
                  />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
