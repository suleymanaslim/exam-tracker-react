import './Dashboard.css'
import { DailyProgress, WeeklyProgress, DashboardSummary } from '../components/DashboardProgress'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTimerStore } from '../lib/timerStore'
import { useAdminStore } from '../lib/adminStore'
import Swal from 'sweetalert2'
import {
  Play, ChevronDown, ChevronRight,
  Shield, Globe, BookOpen, Calculator, Target,
  RotateCcw, Download, FileJson, Check, Trophy, Copy
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { defaultVocabularyText } from '../lib/defaultVocabulary'
import { getAvailableDays, extractDayContent } from '../lib/vocabularyHelper'

// ─── Exam meta ───────────────────────────────────────────────────────────────
const examMeta: Record<string, { icon: LucideIcon; gradient: string; accent: string }> = {
  AGS:   { icon: Shield,     gradient: 'from-[#1e3a5f] to-[#2563eb]', accent: '#2563eb' },
  YDS:   { icon: Globe,      gradient: 'from-[#1a365d] to-[#0891b2]', accent: '#0891b2' },
  IELTS: { icon: BookOpen,   gradient: 'from-[#1e293b] to-[#7c3aed]', accent: '#7c3aed' },
  ALES:  { icon: Calculator, gradient: 'from-[#1a2744] to-[#059669]', accent: '#059669' },
}

// ─── Motivasyon sözleri ───────────────────────────────────────────────────────
const QUOTES = [
  { text: 'Başarı, her gün tekrarlanan küçük çabaların toplamıdır.', author: 'Robert Collier' },
  { text: 'Bugün yaptığın fedakarlıklar, yarın seni ödüllendirecek.', author: 'Bilinmeyen' },
  { text: 'Zorluk olmadan zafer olmaz.', author: 'Thomas Paine' },
  { text: 'Bir saatlik odaklanma, bir günlük dağınıklıktan daha değerlidir.', author: 'Bilinmeyen' },
  { text: 'Hayallerine ulaşmanın tek yolu, onları gerçekten istemektir.', author: 'Bilinmeyen' },
  { text: 'Çalışmak zorunda değilsin; sadece ilerlemek istiyorsun.', author: 'Bilinmeyen' },
  { text: 'Her uzman, bir zamanlar acemi biriydi.', author: 'Helen Hayes' },
]
function getDailyQuote() {
  const day = new Date().getDate()
  return QUOTES[day % QUOTES.length]
}

// ─── Tarih yardımcıları ───────────────────────────────────────────────────────
const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function getMonday(d: Date) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sessionLocalDate(isoStr: string) {
  const d = new Date(isoStr)
  return localDateStr(d)
}

function daysBetween(a: Date, b: Date) {
  const msPerDay = 86400000
  return Math.floor((b.getTime() - a.getTime()) / msPerDay)
}

function duration(minutes: number) {
  const value = Math.max(0, Math.round(minutes))
  return value >= 60 ? `${Math.floor(value / 60)} sa${value % 60 ? ` ${value % 60} dk` : ''}` : `${value} dk`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { setSelExam, setSelSubject, setSelResource, setMode, setSecondsLeft, setTotalSeconds, resetTimer } = useTimerStore()
  const { impersonatedUserId, setIsAdmin, isAdmin } = useAdminStore()
  
  const [displayName, setDisplayName] = useState<string>('Kullanıcı')
  const [showNameModal, setShowNameModal] = useState(false)
  const [tempName, setTempName] = useState('')

  const [exams, setExams]     = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [resources, setResources] = useState<any[]>([])
  const [weekSessions, setWeekSessions] = useState<any[]>([])
  const [weekPlanItems, setWeekPlanItems] = useState<any[]>([])
  const [pomSettings, setPomSettings] = useState({ long_focus_minutes: 50, short_focus_minutes: 25 })

  // Streak
  const [streak, setStreak] = useState(0)

  // Dün çalışılanlar (spaced repetition)
  const [yesterdaySessions, setYesterdaySessions] = useState<any[]>([])

  // Sınav geri sayım
  const [selectedCountdownExam, setSelectedCountdownExam] = useState('')

  // Haftalık rapor
  const [generating, setGenerating] = useState(false)

  // Hızlı başla
  const [quickExam, setQuickExam]     = useState('')
  const [quickSubject, setQuickSubject] = useState('')
  const [quickResource, setQuickResource] = useState('')
  const [quickMode, setQuickMode]     = useState<'pomodoro_long' | 'pomodoro_short'>('pomodoro_long')
  const [quickOpen, setQuickOpen]     = useState(false)
  
  // YKS/YDT Vocabulary State
  const [vocabText, setVocabText] = useState('')
  const [selectedVocabDay, setSelectedVocabDay] = useState<number | ''>('')

  // Leaderboard & Günlük Mesaj
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [dailyMessage, setDailyMessage] = useState('')
  const [isSavingMessage, setIsSavingMessage] = useState(false)
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)

  const quote = getDailyQuote()

  useEffect(() => {
    supabase.from('system_settings').select('value').eq('key', 'yks_vocabulary_program').single()
      .then(r => {
        if (r.data?.value) {
          setVocabText(r.data.value)
        } else {
          setVocabText(defaultVocabularyText)
        }
      })
  }, [])

  const availableDays = useMemo(() => getAvailableDays(vocabText), [vocabText])

  const handleCopyVocab = () => {
    if (!selectedVocabDay) return
    const content = extractDayContent(vocabText, Number(selectedVocabDay))
    if (!content) {
      Swal.fire({ icon: 'warning', title: 'Hata', text: 'Seçilen gün için kelime bulunamadı.' })
      return
    }
    navigator.clipboard.writeText(content).then(() => {
      Swal.fire({
        icon: 'success',
        title: 'Kopyalandı',
        text: `Day ${selectedVocabDay} kelimeleri panoya kopyalandı!`,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1500
      })
    })
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return

      const targetUid = impersonatedUserId || user.id

      // Fetch the display name of the target user
      supabase.from('profiles').select('display_name').eq('id', targetUid).single().then(r => {
        if (r.data?.display_name) {
          setDisplayName(r.data.display_name)
        } else if (!impersonatedUserId) {
          setShowNameModal(true)
        }
      })

      // Upsert profile and check role (only for the actual logged-in user)
      supabase.from('profiles')
        .upsert({ id: user.id, email: user.email, display_name: user.user_metadata?.display_name || 'Kullanıcı' }, { onConflict: 'id', ignoreDuplicates: true })
        .then(() => {
          supabase.from('profiles').select('role').eq('id', user.id).single().then(r => {
            setIsAdmin(r.data?.role === 'admin')
          })
        })

      supabase.from('exams').select('*').eq('user_id', targetUid).then(r => {
        if (r.data) {
          setExams(r.data)
          // Varsayılan geri sayım sınavı
          const saved = localStorage.getItem('countdown_exam')
          if (saved && r.data.find((e: any) => e.id === saved)) setSelectedCountdownExam(saved)
          else if (r.data.length > 0) setSelectedCountdownExam(r.data[0].id)
        }
      })
      supabase.from('subjects').select('*').eq('user_id', targetUid).then(r => r.data && setSubjects(r.data))
      supabase.from('resources').select('*').eq('user_id', targetUid).then(r => r.data && setResources(r.data))
      supabase.from('pomodoro_settings').select('*').eq('user_id', targetUid).single().then(r => {
        if (r.data) setPomSettings({ long_focus_minutes: r.data.long_focus_minutes, short_focus_minutes: r.data.short_focus_minutes })
      })

      // Bu haftanın oturumları
      const monday = getMonday(new Date())
      const sunday = new Date(monday)
      sunday.setDate(sunday.getDate() + 6)
      sunday.setHours(23, 59, 59, 999)
      supabase.from('study_sessions').select('*').eq('user_id', targetUid)
        .gte('started_at', monday.toISOString())
        .lte('started_at', sunday.toISOString())
        .then(r => r.data && setWeekSessions(r.data))

      // Haftalık plan
      const mondayStr = localDateStr(monday)
      const weekDates = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(monday)
        d.setDate(d.getDate() + i)
        return localDateStr(d)
      })

      Promise.all([
        supabase.from('weekly_plans').select('id').eq('user_id', targetUid).eq('week_start_date', mondayStr).single(),
        supabase.from('video_plan_items').select('*, resources(name, subject_id, avg_video_duration, subjects(name))').eq('user_id', targetUid).in('date', weekDates)
      ]).then(async ([wpRes, vpiRes]) => {
        let items: any[] = []
        if (wpRes.data) {
          const { data: pi } = await supabase.from('plan_items').select('*').eq('weekly_plan_id', wpRes.data.id)
          if (pi) items = [...items, ...pi]
        }
        if (vpiRes.data) {
          const vpis = vpiRes.data.map((v: any) => {
            const dateObj = new Date(`${v.date}T00:00:00`)
            const dayOfWeek = dateObj.getDay() === 0 ? 7 : dateObj.getDay()
            const res = v.resources || {}
            
            let cleanName = (res?.name || res?.subjects?.name || 'Video').replace(/MEB-AGS|MEB AGS/g, '').trim()
            
            return {
              id: 'vpi_' + v.id,
              weekly_plan_id: 'video',
              day_of_week: dayOfWeek,
              subject_id: res.subject_id || null,
              resource_id: v.resource_id,
              title: `${cleanName} ${v.video_count}`,
              planned_minutes: v.video_count * (res.avg_video_duration || 0),
              sort_order: -1,
              isVideo: true
            }
          })
          items = [...items, ...vpis]
        }
        setWeekPlanItems(items)
      })

      // ── Streak hesaplama ─────────────────────────────────────────
      supabase.from('study_sessions').select('started_at').eq('user_id', targetUid)
        .order('started_at', { ascending: false }).limit(500).then(r => {
          if (!r.data) return
          const dates = new Set(r.data.map((s: any) => sessionLocalDate(s.started_at)))
          let count = 0
          const today = new Date()
          const todayStr = localDateStr(today)
          // Bugün çalışıldıysa bugünden başla, yoksa dünden
          let checkDate = new Date(today)
          if (!dates.has(todayStr)) {
            checkDate.setDate(checkDate.getDate() - 1)
          }
          while (dates.has(localDateStr(checkDate))) {
            count++
            checkDate.setDate(checkDate.getDate() - 1)
          }
          setStreak(count)
        })
      // ── Dün çalışılanlar (Spaced Repetition) ─────────────────────
      const yest = new Date()
      yest.setDate(yest.getDate() - 1)
      const yestStart = new Date(yest)
      yestStart.setHours(0, 0, 0, 0)
      const yestEnd = new Date(yest)
      yestEnd.setHours(23, 59, 59, 999)

      supabase.from('study_sessions').select('subject_id, resource_id, duration_minutes').eq('user_id', targetUid)
        .gte('started_at', yestStart.toISOString())
        .lte('started_at', yestEnd.toISOString())
        .then(r => r.data && setYesterdaySessions(r.data))

      // ── Leaderboard (Günün Özeti) ─────────────────────────────────
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      Promise.all([
        supabase.from('profiles').select('id, display_name, daily_message'),
        supabase.from('study_sessions').select('user_id, duration_minutes, subject_id, resource_id')
          .gte('started_at', todayStart.toISOString())
          .lte('started_at', todayEnd.toISOString()),
        supabase.from('subjects').select('id, name'),
        supabase.from('resources').select('id, name')
      ]).then(([profRes, sessRes, subRes, resRes]) => {
        if (profRes.data && sessRes.data) {
          const profs = profRes.data
          const sess = sessRes.data
          const subs = subRes.data || []
          const resrcs = resRes.data || []

          const subMap = Object.fromEntries(subs.map(s => [s.id, s.name]))
          const resMap = Object.fromEntries(resrcs.map(r => [r.id, r.name]))

          const myProf = profs.find(p => p.id === targetUid)
          if (myProf && myProf.daily_message) setDailyMessage(myProf.daily_message)

          const userGroups: Record<string, any> = {}
          profs.forEach(p => {
            userGroups[p.id] = { 
              user_id: p.id, 
              name: p.display_name || 'Bilinmeyen', 
              message: p.daily_message || '', 
              total: 0, 
              details: {} 
            }
          })

          sess.forEach(s => {
            if (!userGroups[s.user_id]) return
            userGroups[s.user_id].total += s.duration_minutes
            const subName = s.subject_id ? subMap[s.subject_id] : 'Bilinmeyen Ders'
            const resName = s.resource_id ? resMap[s.resource_id] : 'Genel'
            const key = `${subName} — ${resName}`
            if (!userGroups[s.user_id].details[key]) userGroups[s.user_id].details[key] = 0
            userGroups[s.user_id].details[key] += s.duration_minutes
          })

          const board = Object.values(userGroups)
            .filter(u => u.total > 0 || u.message)
            .sort((a, b) => b.total - a.total)
          
          setLeaderboard(board)
        }
      })
    })
  }, [impersonatedUserId, setIsAdmin])

  // Sınav geri sayımını localstorage'a kaydet
  useEffect(() => {
    if (selectedCountdownExam) localStorage.setItem('countdown_exam', selectedCountdownExam)
  }, [selectedCountdownExam])

  // ─── Hesaplamalar ────────────────────────────────────────────────────────
  const todayDayOfWeek = new Date().getDay()
  const todayIdx = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1

  const totalWeekMinutes = weekSessions.reduce((a, s) => a + s.duration_minutes, 0)
  const totalWeekPlannedMinutes = weekPlanItems.reduce((a, p) => a + p.planned_minutes, 0)
  const dayProgress = DAY_LABELS.map((label, i) => {
    const dayDate = new Date(getMonday(new Date()))
    dayDate.setDate(dayDate.getDate() + i)
    const dStr = localDateStr(dayDate)
    const dayNum = i + 1

    const planned = weekPlanItems.filter(p => p.day_of_week === dayNum).reduce((a, p) => a + p.planned_minutes, 0)
    const studied = weekSessions.filter(s => sessionLocalDate(s.started_at) === dStr).reduce((a, s) => a + s.duration_minutes, 0)
    const pct = planned > 0 ? Math.min(100, (studied / planned) * 100) : studied > 0 ? 100 : 0

    return { label, planned, studied, pct, isToday: i === todayIdx }
  })

  const subjectToExamMap = useMemo(() => {
    const m: Record<string, string> = {}
    subjects.forEach(s => { m[s.id] = s.exam_id })
    return m
  }, [subjects])

  const subjectBreakdown = useMemo(() => {
    const acc: Record<string, number> = {}
    weekSessions.forEach(s => { if (s.subject_id) acc[s.subject_id] = (acc[s.subject_id] || 0) + s.duration_minutes })
    return Object.entries(acc)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([subId, mins]) => {
        const sub = subjects.find(s => s.id === subId)
        const ex = exams.find(e => e.id === subjectToExamMap[subId])
        return { subId, name: sub?.name ?? 'Bilinmeyen', mins, examName: ex?.name ?? '', examColor: ex?.color ?? '#94a3b8' }
      })
  }, [weekSessions, subjects, exams, subjectToExamMap])

  // Dün çalışılan unique ders+kaynak kombinasyonları
  const yesterdayReview = useMemo(() => {
    const map: Record<string, { subjectId: string; resourceId: string | null; mins: number }> = {}
    yesterdaySessions.forEach(s => {
      const key = `${s.subject_id}_${s.resource_id ?? 'none'}`
      if (!map[key]) map[key] = { subjectId: s.subject_id, resourceId: s.resource_id, mins: 0 }
      map[key].mins += s.duration_minutes
    })
    return Object.values(map).sort((a, b) => b.mins - a.mins)
  }, [yesterdaySessions])

  // Sınav geri sayım
  const countdownExam = exams.find(e => e.id === selectedCountdownExam)
  const countdownDays = useMemo(() => {
    if (!countdownExam?.exam_date) return null
    const examDate = new Date(countdownExam.exam_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return daysBetween(today, examDate)
  }, [countdownExam])

  // Plan ve study helper fonksiyonları
  const todayDayOfWeekNum = todayDayOfWeek === 0 ? 7 : todayDayOfWeek
  const todayPlanItems = weekPlanItems.filter(p => p.day_of_week === todayDayOfWeekNum)

  const startFromPlan = (item: any) => {
    const timer = useTimerStore.getState()
    if (timer.isRunning || timer.startedAt || timer.recovery || timer.phase === 'break') { navigate('/study'); return }
    const sub = subjects.find(s => s.id === item.subject_id)
    if (!sub) return
    setSelExam(sub.exam_id)
    setSelSubject(item.subject_id)
    setSelResource(item.resource_id ?? '')
    setMode('pomodoro_long')
    const secs = pomSettings.long_focus_minutes * 60
    setSecondsLeft(secs)
    setTotalSeconds(secs)
    navigate('/study')
  }

  const startQuick = () => {
    const timer = useTimerStore.getState()
    if (timer.isRunning || timer.startedAt || timer.recovery || timer.phase === 'break') { navigate('/study'); return }
    if (!quickSubject) return
    setSelExam(quickExam)
    setSelSubject(quickSubject)
    setSelResource(quickResource)
    setMode(quickMode)
    const secs = quickMode === 'pomodoro_long' ? pomSettings.long_focus_minutes * 60 : pomSettings.short_focus_minutes * 60
    resetTimer(secs)
    navigate('/study')
  }

  const startReview = (subjectId: string, resourceId: string | null) => {
    const timer = useTimerStore.getState()
    if (timer.isRunning || timer.startedAt || timer.recovery || timer.phase === 'break') { navigate('/study'); return }
    const sub = subjects.find(s => s.id === subjectId)
    if (!sub) return
    setSelExam(sub.exam_id)
    setSelSubject(subjectId)
    setSelResource(resourceId ?? '')
    setMode('pomodoro_short')
    const secs = pomSettings.short_focus_minutes * 60
    resetTimer(secs)
    navigate('/study')
  }

  // Haftalık rapor indirme
  const handleExportReport = async (format: 'json' | 'pdf') => {
    setGenerating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGenerating(false); return }

    const monday = getMonday(new Date())
    const weekStart = localDateStr(monday)
    const { data: plan } = await supabase.from('weekly_plans').select('id').eq('user_id', user.id).eq('week_start_date', weekStart).single()
    let planItems: any[] = []
    if (plan) { const { data } = await supabase.from('plan_items').select('*, subjects(name), resources(name)').eq('weekly_plan_id', plan.id); planItems = data ?? [] }

    const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6); sunday.setHours(23, 59, 59, 999)
    const { data: sessions } = await supabase.from('study_sessions').select('*, subjects(name), resources(name)').eq('user_id', user.id).gte('started_at', monday.toISOString()).lte('started_at', sunday.toISOString())

    const { data: examsData } = await supabase.from('exam_results').select('*, exams(name, wrong_penalty, point_per_net)').eq('user_id', user.id).gte('created_at', monday.toISOString()).lte('created_at', sunday.toISOString())
    
    let detailsData: any[] = []
    if (examsData && examsData.length > 0) {
      const resultIds = examsData.map(e => e.id)
      const { data: dData } = await supabase.from('exam_result_details').select('*').in('result_id', resultIds)
      detailsData = dData || []
    }

    const totalPlanned = planItems.reduce((s: number, i: any) => s + i.planned_minutes, 0)
    const totalCompleted = (sessions ?? []).reduce((s: number, i: any) => s + i.duration_minutes, 0)
    
    let denemeDurumu = "Bu hafta deneme çözülmedi"
    if (examsData && examsData.length > 0) {
      denemeDurumu = examsData.map(e => {
        const details = detailsData.filter(d => d.result_id === e.id)
        let correct = 0
        let incorrect = 0
        details.forEach(d => { correct += d.correct_count; incorrect += d.incorrect_count })
        
        let net = correct
        const penalty = e.exams?.wrong_penalty
        if (penalty && penalty > 0) {
          net = correct - (incorrect / penalty)
        }
        net = Math.max(0, parseFloat(net.toFixed(2)))
        let points = net * (e.exams?.point_per_net || 1)
        points = Math.max(0, parseFloat(points.toFixed(2)))
        
        return `${e.exams?.name || 'Sınav'}: ${correct}D ${incorrect}Y ${net}Net (${points} Puan)`
      }).join(' | ')
    }

    const report = {
      hafta: weekStart,
      toplam_planlanan_dk: totalPlanned,
      toplam_calisan_dk: totalCompleted,
      gerceklesme_orani: totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0,
      deneme_sinavi_durumu: denemeDurumu,
      plan_maddeleri: planItems.map(i => ({ gun: i.day_of_week, ders: i.subjects?.name ?? '-', kaynak: i.resources?.name ?? '-', planlanan_dk: i.planned_minutes })),
      calisma_kayitlari: (sessions ?? []).map(s => ({ ders: s.subjects?.name ?? '-', kaynak: s.resources?.name ?? '-', tur: s.session_type, sure_dk: s.duration_minutes, tarih: new Date(s.started_at).toLocaleString('tr-TR') })),
    }

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `haftalik-rapor-${weekStart}.json`; a.click(); URL.revokeObjectURL(url)
    } else {
      // PDF — basit HTML to print
      const w = window.open('', '_blank')
      if (w) {
        w.document.write(`<html><head><title>Haftalık Rapor - ${weekStart}</title><style>body{font-family:Inter,sans-serif;padding:40px;color:#0f172a}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #e2e8f0;padding:8px;text-align:left;font-size:13px}th{background:#f8fafc;font-weight:bold}.stat{display:inline-block;margin-right:32px}</style></head><body>`)
        w.document.write(`<h1>📊 Haftalık Rapor — ${weekStart}</h1>`)
        w.document.write(`<div style="margin:16px 0"><span class="stat"><b>Toplam Planlanan:</b> ${Math.floor(totalPlanned / 60)}sa ${totalPlanned % 60}dk</span><span class="stat"><b>Toplam Çalışılan:</b> ${Math.floor(totalCompleted / 60)}sa ${totalCompleted % 60}dk</span><span class="stat"><b>Gerçekleşme:</b> %${report.gerceklesme_orani}</span></div>`)
        w.document.write(`<div style="margin:16px 0; padding:12px; background:#f0f9ff; border-radius:8px;"><b>🎯 Deneme Sınavları:</b> ${denemeDurumu}</div>`)
        w.document.write(`<h2>Çalışma Kayıtları</h2><table><tr><th>Ders</th><th>Kaynak</th><th>Tür</th><th>Süre</th><th>Tarih</th></tr>`)
        report.calisma_kayitlari.forEach(s => {
          const date = new Date(s.tarih).toLocaleDateString('tr-TR')
          w.document.write(`<tr><td>${s.ders}</td><td>${s.kaynak}</td><td>${s.tur}</td><td>${s.sure_dk} dk</td><td>${date}</td></tr>`)
        })
        w.document.write(`</table></body></html>`)
        w.document.close()
        setTimeout(() => w.print(), 500)
      }
    }
    setGenerating(false)
  }

  const quickFilteredSubjects = subjects.filter(s => s.exam_id === quickExam)
  const quickFilteredResources = resources.filter(r => r.subject_id === quickSubject)
  const getSubjectName = (id: string | null) => subjects.find(s => s.id === id)?.name ?? ''
  const getResourceName = (id: string | null) => resources.find(r => r.id === id)?.name ?? ''

  const saveDisplayName = async () => {
    if (!tempName.trim()) return
    await supabase.auth.updateUser({ data: { display_name: tempName.trim() } })
    setDisplayName(tempName.trim())
    setShowNameModal(false)
  }

  const container: any = {
    hidden: { opacity: 0 },
    show:   { opacity: 1, transition: { staggerChildren: 0.06 } }
  }

  const saveDailyMessage = async () => {
    setIsSavingMessage(true)
    const targetUid = impersonatedUserId || (await supabase.auth.getUser()).data.user?.id
    if (targetUid) {
      await supabase.from('profiles').update({ daily_message: dailyMessage }).eq('id', targetUid)
      setLeaderboard(prev => prev.map(p => p.user_id === targetUid ? { ...p, message: dailyMessage } : p))
    }
    setIsSavingMessage(false)
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="dashboard">

      {/* Name Onboarding Modal */}
      {showNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold text-[#0f172a] mb-2">Hoş Geldin! 👋</h2>
            <p className="text-[13px] text-[#64748b] mb-4">Sana nasıl hitap etmemizi istersin?</p>
            <input
              autoFocus
              type="text"
              value={tempName}
              onChange={e => setTempName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveDisplayName()}
              placeholder="Adın veya lakabın..."
              className="w-full h-10 rounded-xl border border-[#e2e8f0] px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 mb-4"
            />
            <button
              onClick={saveDisplayName}
              disabled={!tempName.trim()}
              className="w-full h-10 rounded-xl bg-[#2563eb] text-white text-[13px] font-bold hover:bg-blue-600 transition-all disabled:opacity-50"
            >
              Kaydet ve Başla
            </button>
          </div>
        </div>
      )}

      <header className="dash-header">
        <div><p className="dash-eyebrow">ÇALIŞMA ALANIN</p><h1>Merhaba, {displayName}</h1><p className="dash-date">{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
        <DashboardSummary streak={streak} studied={totalWeekMinutes} planned={totalWeekPlannedMinutes} />
      </header>
      <DailyProgress day={dayProgress[todayIdx]} regularMinutes={todayPlanItems.filter(p => !p.isVideo).reduce((sum, p) => sum + p.planned_minutes, 0)} videoMinutes={todayPlanItems.filter(p => p.isVideo).reduce((sum, p) => sum + p.planned_minutes, 0)} />
      <div className="dash-main-grid">
        <section className="dash-panel dash-plan">
          <div className="dash-section-head"><div><p className="dash-eyebrow">BUGÜN</p><h2>Çalışma planın <span className="dash-count">{todayPlanItems.length}</span></h2></div><button className="dash-text-button" onClick={() => navigate('/plan')}>Planı aç <ChevronRight size={15} /></button></div>
          <div className="dash-plan-list">
            {todayPlanItems.length === 0 ? <div className="dash-empty"><BookOpen size={26} /><h3>Bugün için planın hazır değil</h3><p>Haftalık veya video planına eklediğin çalışmalar burada görünür.</p><button className="dash-secondary" onClick={() => navigate('/plan')}>Planına git</button></div> : todayPlanItems.map((p, index) => {
              const ex = exams.find(e => subjects.find(s => s.id === p.subject_id)?.exam_id === e.id)
              return <button key={p.id} className="dash-plan-row" onClick={() => startFromPlan(p)} disabled={!p.subject_id}>
                <span className="dash-row-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="dash-row-copy"><strong>{getSubjectName(p.subject_id) || p.title || 'Çalışma'}</strong><span>{(p.isVideo ? p.title : getResourceName(p.resource_id)) || p.title || ex?.name || 'Genel çalışma'}</span></span>
                <span className="dash-plan-meta"><span>{p.isVideo ? 'Video' : 'Ders'}</span><b>{duration(p.planned_minutes)}</b></span><span className="dash-play"><Play size={14} /></span>
              </button>
            })}
          </div>
          <div className="dash-quick"><button className="dash-text-button" aria-expanded={quickOpen} onClick={() => setQuickOpen(p => !p)}><Play size={14} /> Plansız çalışma başlat <ChevronDown size={14} /></button>
            {quickOpen && <div className="dash-quick-form">
              <label>Sınav<select aria-label="Sınav" value={quickExam} onChange={e => { setQuickExam(e.target.value); setQuickSubject(''); setQuickResource('') }}><option value="">Sınav seç</option>{exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
              <label>Ders<select aria-label="Ders" value={quickSubject} disabled={!quickExam} onChange={e => { setQuickSubject(e.target.value); setQuickResource('') }}><option value="">Ders seç</option>{quickFilteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label>Kaynak<select aria-label="Kaynak" value={quickResource} disabled={!quickSubject} onChange={e => setQuickResource(e.target.value)}><option value="">Kaynak (isteğe bağlı)</option>{quickFilteredResources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
              <label>Oturum<select aria-label="Oturum" value={quickMode} onChange={e => setQuickMode(e.target.value as typeof quickMode)}><option value="pomodoro_long">Uzun · {pomSettings.long_focus_minutes} dk</option><option value="pomodoro_short">Kısa · {pomSettings.short_focus_minutes} dk</option></select></label>
              <button className="dash-primary" disabled={!quickSubject} onClick={startQuick}><Play size={14} /> Çalışmaya başla</button>
            </div>}
          </div>
        </section>
        <aside className="dash-side">
          <WeeklyProgress days={dayProgress} />
          <section className="dash-countdown"><div><p className="dash-eyebrow">SIRADAKİ HEDEF</p><select aria-label="Geri sayım sınavı" value={selectedCountdownExam} onChange={e => setSelectedCountdownExam(e.target.value)}>{exams.length === 0 && <option value="">Sınav yok</option>}{exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>{countdownExam?.exam_date && <p className="dash-muted">{new Date(countdownExam.exam_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</p>}</div><div className="dash-countdown-number">{countdownDays !== null ? <><strong>{Math.abs(countdownDays)}</strong><span>{countdownDays < 0 ? 'gün geçti' : 'gün kaldı'}</span></> : <span>Tarih belirlenmemiş</span>}</div></section>
        </aside>
      </div>
      <div className="dash-section-divider"><div><p className="dash-eyebrow">GENEL BAKIŞ</p><h2>Bu haftanın özeti</h2></div><div className="dash-export"><button className="dash-text-button" disabled={generating} onClick={() => handleExportReport('pdf')}><Download size={14} /> PDF</button><button className="dash-text-button" disabled={generating} onClick={() => handleExportReport('json')}><FileJson size={14} /> JSON</button></div></div>
      <div className="dash-overview-grid">
        <section className="dash-panel"><div className="dash-section-head"><h3>Ders dağılımı</h3><span className="dash-muted">Bu hafta</span></div><div className="dash-subjects">{subjectBreakdown.length === 0 ? <p className="dash-empty-note">İlk çalışmandan sonra dağılımın burada görünecek.</p> : subjectBreakdown.map(s => <div key={s.subId}><div className="dash-subject-label"><span>{s.name}</span><b>{duration(s.mins)}</b></div><div className="dash-track"><span style={{ width: `${s.mins / Math.max(1, subjectBreakdown[0].mins) * 100}%` }} /></div></div>)}</div></section>
        <section className="dash-panel"><div className="dash-section-head"><h3>Sınavlara ayırdığın zaman</h3></div><div className="dash-exams">{exams.length === 0 ? <p className="dash-empty-note">Henüz sınav eklenmemiş.</p> : exams.map(ex => { const Icon = examMeta[ex.name]?.icon || Target; const mins = weekSessions.filter(s => subjectToExamMap[s.subject_id] === ex.id).reduce((sum, s) => sum + s.duration_minutes, 0); return <div key={ex.id} className="dash-exam"><span className="dash-exam-icon"><Icon size={18} /></span><div><span>{ex.name}</span><strong>{duration(mins)}</strong></div></div> })}</div></section>
      </div>
      <div className="dash-overview-grid">
        <section className="dash-panel"><div className="dash-section-head"><div><h3>Birlikte ilerliyoruz</h3><p className="dash-muted">Günün çalışma sıralaması</p></div><Trophy size={18} className="dash-muted" /></div>
          <div className="dash-community">{leaderboard.length === 0 ? <p className="dash-empty-note">Bugünün ilk çalışması henüz kaydedilmedi.</p> : leaderboard.map((u, i) => <div key={u.user_id}><button className="dash-community-row" aria-expanded={expandedUserId === u.user_id} onClick={() => setExpandedUserId(expandedUserId === u.user_id ? null : u.user_id)}><span className="dash-rank">{i + 1}</span><span className="dash-row-copy"><strong>{u.name}</strong>{u.message && <span>{u.message}</span>}</span><b>{duration(u.total)}</b><ChevronDown size={14} /></button>{expandedUserId === u.user_id && <div className="dash-user-details">{Object.entries(u.details).map(([k, mins]) => <div key={k}><span>{k}</span><b>{duration(Number(mins))}</b></div>)}</div>}</div>)}</div>
          <form className="dash-message" onSubmit={e => { e.preventDefault(); saveDailyMessage() }}><input aria-label="Günlük durum mesajı" placeholder="Bugün için bir not bırak…" value={dailyMessage} onChange={e => setDailyMessage(e.target.value)} /><button className="dash-secondary" disabled={isSavingMessage} aria-label="Durum mesajını kaydet"><Check size={16} /></button></form>
        </section>
        <section className="dash-panel"><div className="dash-section-head"><div><h3>Dünü hatırla</h3><p className="dash-muted">Kısa bir tekrar, kalıcı bir adım.</p></div><RotateCcw size={18} className="dash-muted" /></div><div className="dash-review">{yesterdayReview.length === 0 ? <p className="dash-empty-note">Dün için çalışma kaydı yok.</p> : yesterdayReview.map((r, i) => <button className="dash-plan-row" key={i} onClick={() => startReview(r.subjectId, r.resourceId)}><span className="dash-row-copy"><strong>{getSubjectName(r.subjectId) || 'Çalışma'}</strong><span>{getResourceName(r.resourceId)}</span></span><b className="dash-muted">{duration(r.mins)}</b><span className="dash-play"><Play size={14} /></span></button>)}</div></section>
      </div>
      <footer className="dash-quote"><p>“{quote.text}”</p><span>{quote.author}</span></footer>
      {isAdmin && <details className="dash-panel dash-admin"><summary>YKS / YDT kelime araçları</summary><p className="dash-muted">Paylaşmak istediğin günün kelimelerini kopyala.</p><div className="dash-admin-controls"><select aria-label="Kelime günü" value={selectedVocabDay} onChange={e => setSelectedVocabDay(e.target.value ? Number(e.target.value) : '')}><option value="">Gün seç</option>{availableDays.map(d => <option key={d} value={d}>Day {d}</option>)}</select><button className="dash-secondary" onClick={handleCopyVocab} disabled={!selectedVocabDay}><Copy size={15} /> Kopyala</button></div></details>}
    </motion.div>
  )
}
