import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  Calendar as CalendarIcon, Flame, TrendingUp, Target, BookOpen, Trophy, Zap, Sun, BarChart3
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts'
import { useAdminStore } from '../lib/adminStore'

interface Session { id: string; subject_id: string; duration_minutes: number; started_at: string }
interface Subject { id: string; exam_id: string; name: string }
interface Exam { id: string; name: string; color: string }

export default function Stats() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
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

  // --- Genel Özet ---
  const totalMinutes = sessions.reduce((sum, s) => sum + s.duration_minutes, 0)
  const totalHours = Math.floor(totalMinutes / 60)
  
  // Bu hafta hesaplaması
  const now = new Date()
  const todayDay = now.getDay()
  const diff = now.getDate() - todayDay + (todayDay === 0 ? -6 : 1)
  const monday = new Date(now)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  const weekMinutes = sessions
    .filter(s => new Date(s.started_at) >= monday)
    .reduce((sum, s) => sum + s.duration_minutes, 0)

  // Aktif gün sayısı ve günlük ortalama
  const activeDays = new Set(sessions.map(s => s.started_at?.split('T')?.[0] || '')).size - (sessions.length > 0 ? 0 : 1)
  const safeActiveDays = Math.max(0, activeDays)
  const dailyAverage = safeActiveDays > 0 ? Math.round(totalMinutes / safeActiveDays) : 0

  // --- 14 Günlük Trend (Area Chart) ---
  const trendData = useMemo(() => {
    const days: { label: string; dateStr: string; minutes: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const label = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
      days.push({ label, dateStr, minutes: 0 })
    }
    sessions.forEach(s => {
      const sDate = s.started_at?.split('T')?.[0]
      if (sDate) {
        const day = days.find(d => d.dateStr === sDate)
        if (day) day.minutes += (s.duration_minutes || 0)
      }
    })
    return days
  }, [sessions])

  // --- Sınav Dağılımı (Donut Chart) ---
  const examData = useMemo(() => {
    const map: Record<string, number> = {}
    exams.forEach(e => { map[e.id] = 0 })
    sessions.forEach(s => {
      const eid = subjectToExam[s.subject_id]
      if (eid) map[eid] = (map[eid] ?? 0) + s.duration_minutes
    })
    return exams.map(e => ({
      name: e.name,
      minutes: map[e.id] ?? 0,
      color: e.color,
    })).filter(e => e.minutes > 0).sort((a, b) => b.minutes - a.minutes)
  }, [sessions, subjects, exams, subjectToExam])

  // --- En Çok Çalışılan Dersler (Bar List) ---
  const subjectData = useMemo(() => {
    const map: Record<string, number> = {}
    sessions.forEach(s => {
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
  }, [sessions, subjects, exams])
  
  const maxSubjectMin = Math.max(...subjectData.map(s => s.minutes), 1)

  // --- Zaman Dilimi Verimliliği (Radar Chart) ---
  const timeOfDayData = useMemo(() => {
    let morning = 0, afternoon = 0, evening = 0, night = 0
    sessions.forEach(s => {
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
  }, [sessions])

  const mostProductiveTime = [...timeOfDayData].sort((a, b) => b.A - a.A)[0]

  if (loading) return <div className="h-full flex items-center justify-center text-[#94a3b8]">Yükleniyor...</div>

  return (
    <div className="flex flex-col h-full gap-4 overflow-y-auto pr-2 pb-4">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a] flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-[#2563eb]" /> İstatistikler & Analiz
          </h1>
          <p className="text-[13px] text-[#64748b] mt-1">Çalışma verimini artırmak için performansını detaylı incele.</p>
        </div>
      </div>

      {/* Row 1: KPI Kartları */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 hover:shadow-md transition-all relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-blue-50/50 group-hover:scale-150 transition-all duration-500" />
          <div className="flex items-center justify-between mb-4 relative">
            <h3 className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Toplam Çalışma</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Trophy className="h-5 w-5" />
            </div>
          </div>
          <div className="relative">
            <p className="text-3xl font-black text-[#0f172a]">{totalHours}<span className="text-base text-[#94a3b8] font-semibold ml-1">sa</span> {totalMinutes % 60}<span className="text-base text-[#94a3b8] font-semibold ml-1">dk</span></p>
            <p className="text-[11px] font-medium text-[#64748b] mt-1">Tüm zamanların toplamı</p>
          </div>
        </div>

        <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 hover:shadow-md transition-all relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-50/50 group-hover:scale-150 transition-all duration-500" />
          <div className="flex items-center justify-between mb-4 relative">
            <h3 className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Bu Hafta</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="relative">
            <p className="text-3xl font-black text-[#0f172a]">{Math.floor(weekMinutes / 60)}<span className="text-base text-[#94a3b8] font-semibold ml-1">sa</span> {weekMinutes % 60}<span className="text-base text-[#94a3b8] font-semibold ml-1">dk</span></p>
            <p className="text-[11px] font-medium text-[#64748b] mt-1">Pazartesi'den itibaren</p>
          </div>
        </div>

        <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 hover:shadow-md transition-all relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-orange-50/50 group-hover:scale-150 transition-all duration-500" />
          <div className="flex items-center justify-between mb-4 relative">
            <h3 className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Günlük Ortalama</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <Flame className="h-5 w-5" />
            </div>
          </div>
          <div className="relative">
            <p className="text-3xl font-black text-[#0f172a]">{Math.floor(dailyAverage / 60)}<span className="text-base text-[#94a3b8] font-semibold ml-1">sa</span> {dailyAverage % 60}<span className="text-base text-[#94a3b8] font-semibold ml-1">dk</span></p>
            <p className="text-[11px] font-medium text-[#64748b] mt-1">Aktif çalışılan {safeActiveDays} gün baz alınarak</p>
          </div>
        </div>

        <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 hover:shadow-md transition-all relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-purple-50/50 group-hover:scale-150 transition-all duration-500" />
          <div className="flex items-center justify-between mb-4 relative">
            <h3 className="text-xs font-bold text-[#64748b] uppercase tracking-wider">En Verimli Saat</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <Zap className="h-5 w-5" />
            </div>
          </div>
          <div className="relative">
            <p className="text-2xl font-black text-[#0f172a] truncate">{mostProductiveTime?.subject || 'Bilinmiyor'}</p>
            <p className="text-[11px] font-medium text-[#64748b] mt-1">{(mostProductiveTime?.A || 0) > 0 ? 'Bu zaman diliminde daha iyisin' : 'Henüz veri yok'}</p>
          </div>
        </div>
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:min-h-[300px]">
        {/* 14 Günlük Trend */}
        <div className="col-span-1 lg:col-span-2 rounded-xl border border-[#e2e8f0] bg-white flex flex-col p-5 min-h-[300px] lg:min-h-0">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-[#0f172a] flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-[#2563eb]" /> Son 14 Günlük Performans
            </h3>
          </div>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMinutes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}m`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(val: any) => [`${Math.floor(val/60)} sa ${val%60} dk`, 'Süre']}
                  labelStyle={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey="minutes" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorMinutes)" activeDot={{ r: 6, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sınav Dağılımı */}
        <div className="col-span-1 rounded-xl border border-[#e2e8f0] bg-white flex flex-col p-5 min-h-[300px] lg:min-h-0">
          <h3 className="text-sm font-bold text-[#0f172a] mb-2 flex items-center gap-2">
            <Target className="h-4 w-4 text-[#2563eb]" /> Sınav Dağılımı
          </h3>
          <div className="flex-1 relative flex items-center justify-center">
            {totalMinutes === 0 ? (
              <p className="text-[12px] text-[#94a3b8]">Henüz veri yok.</p>
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
                <span className="text-[#94a3b8] text-[10px] font-semibold uppercase tracking-wider">Toplam</span>
                <span className="text-lg font-black text-[#0f172a] leading-none mt-1">{totalHours}s</span>
              </div>
            )}
          </div>
          <div className="mt-2 space-y-2">
            {examData.map(e => (
              <div key={e.name} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: e.color }} />
                  <span className="font-semibold text-[#64748b]">{e.name}</span>
                </div>
                <span className="font-bold text-[#0f172a]">{Math.round((e.minutes / totalMinutes) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Deep Dives */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* En Çok Çalışılan Dersler */}
        <div className="rounded-xl border border-[#e2e8f0] bg-white p-5">
          <h3 className="text-sm font-bold text-[#0f172a] mb-5 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#2563eb]" /> En Çok Çalışılan Dersler (Top 5)
          </h3>
          <div className="space-y-4">
            {subjectData.length === 0 ? (
              <p className="text-[12px] text-[#94a3b8] text-center py-4">Henüz veri yok.</p>
            ) : (
              subjectData.map((s, i) => (
                <div key={i}>
                  <div className="flex justify-between text-[12px] font-medium mb-1.5">
                    <span className="text-[#0f172a] truncate pr-4">{s.name}</span>
                    <span className="text-[#64748b] whitespace-nowrap">{Math.floor(s.minutes / 60)} sa {s.minutes % 60} dk</span>
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
        <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 flex flex-col">
          <h3 className="text-sm font-bold text-[#0f172a] mb-2 flex items-center gap-2">
            <Sun className="h-4 w-4 text-[#2563eb]" /> Zaman Dilimi Analizi
          </h3>
          <p className="text-[11px] text-[#64748b] mb-4">Hangi saat aralıklarında daha çok odaklandığını gör.</p>
          <div className="flex-1 flex items-center justify-center h-[200px]">
            {totalMinutes === 0 ? (
              <p className="text-[12px] text-[#94a3b8]">Henüz veri yok.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={timeOfDayData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} />
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
