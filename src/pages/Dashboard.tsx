import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTimerStore } from '../lib/timerStore'
import { useAdminStore } from '../lib/adminStore'
import Swal from 'sweetalert2'
import {
  Play, Clock, TrendingUp, Zap, ChevronDown, ChevronRight,
  Shield, Globe, BookOpen, Calculator, Target,
  Flame, CalendarClock, RotateCcw, Download, FileJson, MessageSquare, Check, Trophy, Copy
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
      sunday.setHours(23, 59, 59)
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
        supabase.from('video_plan_items').select('*, resources(subject_id, avg_video_duration)').eq('user_id', targetUid).in('date', weekDates)
      ]).then(async ([wpRes, vpiRes]) => {
        let items: any[] = []
        if (wpRes.data) {
          const { data: pi } = await supabase.from('plan_items').select('*').eq('weekly_plan_id', wpRes.data.id)
          if (pi) items = [...items, ...pi]
        }
        if (vpiRes.data) {
          const vpis = vpiRes.data.map((v: any) => {
            const dateObj = new Date(v.date)
            const dayOfWeek = dateObj.getDay() === 0 ? 7 : dateObj.getDay()
            const res = v.resources || {}
            return {
              id: 'vpi_' + v.id,
              weekly_plan_id: 'video',
              day_of_week: dayOfWeek,
              subject_id: res.subject_id || null,
              resource_id: v.resource_id,
              title: `${v.video_count} Video`,
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
  const weekProgressPercent = totalWeekPlannedMinutes > 0
    ? Math.min(100, Math.round((totalWeekMinutes / totalWeekPlannedMinutes) * 100))
    : 0

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

    const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6); sunday.setHours(23, 59, 59)
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

  const item: any = {
    hidden: { opacity: 0, y: 16 },
    show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 22 } }
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
    <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col h-full gap-3 overflow-y-auto">

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

      {/* ══════════════════════════════════════════════════════════════
           MOBİL LAYOUT (md altında görünür)
      ══════════════════════════════════════════════════════════════ */}
      <div className="md:hidden flex flex-col gap-3">

        {/* MOBİL ROW 1 — Karşılama + Seri + Bu hafta */}
        <motion.div variants={item} className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-[17px] font-black text-[#0f172a] truncate">Merhaba, {displayName} 👋</h1>
            <p className="text-[11px] text-[#64748b] mt-0.5 italic truncate">"{quote.text}"</p>
          </div>
        </motion.div>

        {/* MOBİL ROW 2 — Stats row (streak, bu hafta, geri sayım) */}
        <motion.div variants={item} className="grid grid-cols-3 gap-2">
          {/* Seri */}
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-3 flex flex-col items-center justify-center">
            <Flame className={`h-5 w-5 mb-1 ${streak > 0 ? 'text-orange-500' : 'text-[#94a3b8]'}`} />
            <p className="text-[18px] font-black text-[#0f172a] leading-none">{streak}</p>
            <p className="text-[9px] text-[#94a3b8] font-semibold uppercase mt-0.5">Gün Seri</p>
          </div>

          {/* Bu Hafta */}
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-3 flex flex-col items-center justify-center">
            <TrendingUp className="h-5 w-5 mb-1 text-[#2563eb]" />
            <p className="text-[18px] font-black text-[#0f172a] leading-none">
              {Math.floor(totalWeekMinutes / 60)}<span className="text-[11px] font-semibold text-[#94a3b8]">sa</span>
            </p>
            <p className="text-[9px] text-[#94a3b8] font-semibold uppercase mt-0.5">Bu Hafta</p>
          </div>

          {/* Sınav Geri Sayım */}
          <div className={`rounded-xl p-3 flex flex-col items-center justify-center border ${
            countdownDays !== null && countdownDays <= 7 ? 'bg-red-50 border-red-200' :
            countdownDays !== null && countdownDays <= 30 ? 'bg-orange-50 border-orange-200' :
            'bg-white border-[#e2e8f0]'
          }`}>
            <CalendarClock className={`h-5 w-5 mb-1 ${
              countdownDays !== null && countdownDays <= 7 ? 'text-red-500' :
              countdownDays !== null && countdownDays <= 30 ? 'text-orange-500' :
              'text-[#2563eb]'
            }`} />
            {countdownDays !== null ? (
              <>
                <p className={`text-[18px] font-black leading-none ${
                  countdownDays <= 7 ? 'text-red-500' : countdownDays <= 30 ? 'text-orange-500' : 'text-[#0f172a]'
                }`}>{countdownDays}</p>
                <p className="text-[9px] text-[#94a3b8] font-semibold uppercase mt-0.5">Gün Kaldı</p>
              </>
            ) : (
              <p className="text-[9px] text-[#94a3b8] text-center font-semibold">Tarih Girilmemiş</p>
            )}
          </div>
        </motion.div>

        {/* MOBİL ROW 3 — Haftalık İlerleme Barları (kompakt) */}
        <motion.div variants={item} className="bg-white rounded-xl border border-[#e2e8f0] px-3 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[11px] font-bold text-[#0f172a] flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-[#2563eb]" /> Haftalık İlerleme
            </h3>
            <span className="text-[9px] text-[#64748b]">
              {Math.floor(totalWeekMinutes / 60)}sa / {Math.floor(totalWeekPlannedMinutes / 60)}sa
              {totalWeekPlannedMinutes > 0 && <span className="ml-1 font-bold text-[#2563eb]">%{weekProgressPercent}</span>}
            </span>
          </div>
          <div className="flex items-end justify-between gap-1 h-[56px]">
            {dayProgress.map((d, i) => (
              <div key={d.label} className="flex-1 flex flex-col items-center gap-0.5 justify-end h-full">
                <div className="relative w-full flex items-end" style={{ height: '44px' }}>
                  {d.planned > 0 && <div className="absolute inset-x-0.5 bottom-0 rounded-sm bg-[#e2e8f0]" style={{ height: '100%' }} />}
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: d.pct > 0 ? `${Math.max(8, d.pct)}%` : '2px' }}
                    transition={{ duration: 0.5, type: 'spring', bounce: 0.3, delay: i * 0.04 }}
                    className={`absolute inset-x-0.5 bottom-0 rounded-sm ${d.isToday ? 'bg-[#2563eb]' : d.pct >= 100 ? 'bg-emerald-500' : 'bg-[#93c5fd]'}`}
                  />
                </div>
                <span className={`text-[8px] font-bold ${d.isToday ? 'text-[#2563eb]' : 'text-[#94a3b8]'}`}>{d.label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* MOBİL ROW 4 — Sınav Kartları (görünür, büyük) */}
        {exams.length > 0 && (
          <motion.div variants={item} className="grid grid-cols-2 gap-2">
            {exams.map(ex => {
              const isStandard = !!examMeta[ex.name]
              const Icon = isStandard ? examMeta[ex.name].icon : Target
              const bgClass = isStandard ? `bg-gradient-to-br ${examMeta[ex.name].gradient}` : ''
              const bgStyle = !isStandard ? { backgroundColor: ex.color } : {}
              const mins = weekSessions.filter(s => subjects.find(sub => sub.id === s.subject_id)?.exam_id === ex.id).reduce((a, s) => a + s.duration_minutes, 0)
              const hours = Math.floor(mins / 60)
              const remMins = mins % 60
              return (
                <div key={ex.id} className="rounded-xl border border-[#e2e8f0] bg-white overflow-hidden flex flex-col">
                  <div className={`${bgClass} px-3 py-2.5 flex items-center gap-2`} style={bgStyle}>
                    <Icon className="h-4 w-4 text-white" />
                    <h3 className="font-bold text-white text-[13px]">{ex.name}</h3>
                  </div>
                  <div className="px-3 py-3 text-center">
                    <p className="text-[22px] font-black text-[#0f172a] leading-none">
                      {hours}<span className="text-[11px] font-semibold text-[#94a3b8] ml-0.5">sa</span>{' '}
                      {remMins}<span className="text-[11px] font-semibold text-[#94a3b8] ml-0.5">dk</span>
                    </p>
                    <p className="text-[9px] text-[#94a3b8] mt-0.5">Bu hafta</p>
                  </div>
                </div>
              )
            })}
          </motion.div>
        )}

        {/* MOBİL ROW 5 — Bugünün Planından Hızlı Başla */}
        {todayPlanItems.length > 0 && (
          <motion.div variants={item} className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <div className="px-3 py-2.5 border-b border-[#f1f5f9] flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <h3 className="text-[12px] font-bold text-[#0f172a]">Bugünün Planı</h3>
            </div>
            <div className="p-2.5 space-y-1.5">
              {todayPlanItems.slice(0, 4).map((planItem: any) => {
                const subName = getSubjectName(planItem.subject_id)
                const ex = exams.find(e => subjects.find(s => s.id === planItem.subject_id)?.exam_id === e.id)
                return (
                  <button key={planItem.id} onClick={() => startFromPlan(planItem)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-[#e2e8f0] active:bg-[#eff6ff] transition-all text-left">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ex?.color ?? '#94a3b8' }} />
                    <span className="text-[13px] font-semibold text-[#0f172a] truncate flex-1">{subName}</span>
                    <div className="h-7 w-7 rounded-lg bg-[#2563eb] flex items-center justify-center shrink-0">
                      <Play className="h-3 w-3 text-white" fill="white" />
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* MOBİL ROW 6 — Bu Hafta Ders Dağılımı (en altta) */}
        {subjectBreakdown.length > 0 && (
          <motion.div variants={item} className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <div className="px-3 py-2.5 border-b border-[#f1f5f9] flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-[#2563eb]" />
              <h3 className="text-[12px] font-bold text-[#0f172a]">Bu Hafta Ders Dağılımı</h3>
            </div>
            <div className="p-3 space-y-2.5">
              {subjectBreakdown.map((s, i) => {
                const maxMins = subjectBreakdown[0].mins
                const pct = Math.round((s.mins / maxMins) * 100)
                return (
                  <div key={s.subId}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.examColor }} />
                        <span className="font-semibold text-[#0f172a] truncate">{s.name}</span>
                      </div>
                      <span className="font-bold text-[#0f172a] shrink-0 ml-1.5 text-[10px]">
                        {Math.floor(s.mins / 60) > 0 ? `${Math.floor(s.mins / 60)}sa ` : ''}{s.mins % 60}dk
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#f1f5f9] overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, delay: i * 0.07, type: 'spring' }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: s.examColor }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* MOBİL ROW 7 — Günlük Mesaj */}
        <motion.div variants={item} className="bg-white rounded-xl border border-[#e2e8f0] p-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <MessageSquare className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-indigo-400" />
              <input
                type="text"
                value={dailyMessage}
                onChange={e => setDailyMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveDailyMessage()}
                placeholder="Bugün için durum mesajı..."
                className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-lg pl-8 pr-3 py-2 text-[12px] text-[#0f172a] focus:outline-none focus:border-indigo-400"
              />
            </div>
            <button onClick={saveDailyMessage} disabled={isSavingMessage} className="bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg p-2 transition-all shrink-0">
              {isSavingMessage ? <div className="h-4 w-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
          </div>
        </motion.div>

        {/* MOBİL ROW 8 — Admin Kelime Paneli */}
        {isAdmin && (
          <motion.div variants={item} className="bg-white rounded-xl border border-indigo-100 p-3">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-4 w-4 text-indigo-500" />
              <h3 className="text-[12px] font-bold text-[#0f172a]">YKS Kelime Kopyalama</h3>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedVocabDay}
                onChange={e => setSelectedVocabDay(e.target.value ? Number(e.target.value) : '')}
                className="flex-1 h-9 rounded-lg border border-[#e2e8f0] bg-white px-2 text-[12px] focus:outline-none"
              >
                <option value="">Gün Seçiniz...</option>
                {availableDays.map(d => <option key={d} value={d}>Day {d}</option>)}
              </select>
              <button
                onClick={handleCopyVocab}
                disabled={!selectedVocabDay}
                className="h-9 px-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[12px] font-bold disabled:opacity-50 flex items-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" /> Kopyala
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
           DESKTOP LAYOUT (md ve üzerinde görünür)
      ══════════════════════════════════════════════════════════════ */}
      <div className="hidden md:contents">

      {/* ══ ROW 1 — Header + Streak + Motivasyon ═══════════════════════════ */}
      {/* Name Onboarding Modal - handled above */}

      {/* Header */}
      <motion.div variants={item} className="flex flex-col md:flex-row md:items-start justify-between shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">Merhaba, {displayName} 👋</h1>
          <p className="text-[13px] text-[#64748b] mt-1 font-medium">{quote.text} — <span className="text-[#94a3b8] italic">{quote.author}</span></p>
          
          {/* Günlük Mesaj Alanı */}
          <div className="mt-4 flex items-center gap-2 w-full max-w-sm">
            <div className="flex-1 relative">
              <MessageSquare className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-indigo-400" />
              <input 
                type="text" 
                value={dailyMessage} 
                onChange={e => setDailyMessage(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && saveDailyMessage()}
                placeholder="Bugün için bir durum mesajı bırak..."
                className="w-full bg-white border border-[#e2e8f0] rounded-lg pl-8 pr-3 py-1.5 text-[12px] text-[#0f172a] focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all shadow-sm"
              />
            </div>
            <button onClick={saveDailyMessage} disabled={isSavingMessage} title="Mesajı Güncelle" className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg p-1.5 transition-all shrink-0 border border-indigo-100">
              {isSavingMessage ? <div className="h-4 w-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0 self-start md:self-auto mt-2 md:mt-0">
          {/* Streak */}
          <div className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 px-3 py-2">
            <Flame className={`h-5 w-5 ${streak > 0 ? 'text-orange-500 animate-pulse' : 'text-[#94a3b8]'}`} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">Seri</p>
              <p className="text-lg font-black text-[#0f172a] leading-none">{streak}<span className="text-[10px] font-semibold text-[#94a3b8] ml-0.5">gün</span></p>
            </div>
          </div>
          {/* Bu hafta toplam */}
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">Bu Hafta</p>
            <p className="text-xl font-black text-[#0f172a] leading-none">
              {Math.floor(totalWeekMinutes / 60)}<span className="text-sm font-semibold text-[#64748b]"> sa </span>
              {totalWeekMinutes % 60}<span className="text-sm font-semibold text-[#64748b]"> dk</span>
            </p>
          </div>
          {totalWeekPlannedMinutes > 0 && (
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-[#2563eb]/20 bg-[#eff6ff] relative">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                <circle cx="28" cy="28" r="24" fill="none" stroke="#2563eb" strokeWidth="4"
                  strokeDasharray={2 * Math.PI * 24}
                  strokeDashoffset={2 * Math.PI * 24 * (1 - weekProgressPercent / 100)}
                  strokeLinecap="round" />
              </svg>
              <span className="text-[11px] font-black text-[#2563eb] z-10">%{weekProgressPercent}</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* ══ ROW 2 — Haftalık Barlar + Hızlı Başla + Sınav Geri Sayım ═════ */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-12 gap-3 shrink-0">

        {/* Haftalık İlerleme Barları */}
        <div className="md:col-span-5 rounded-xl border border-[#e2e8f0] bg-white px-4 py-3 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-bold text-[#0f172a] flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-[#2563eb]" /> Haftalık İlerleme
            </h3>
            <span className="text-[10px] text-[#64748b]">
              {Math.floor(totalWeekMinutes / 60)}sa / {Math.floor(totalWeekPlannedMinutes / 60)}sa
            </span>
          </div>
          <div className="flex items-end justify-between gap-1.5 h-[72px]">
            {dayProgress.map((d, i) => (
              <div key={d.label} className="flex-1 flex flex-col items-center gap-0.5 justify-end h-full relative group">
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none z-20 whitespace-nowrap">
                  <div className="bg-[#0f172a] text-white text-[9px] font-semibold py-1 px-2 rounded-lg shadow-xl">
                    {d.studied > 0
                      ? <><span className="text-emerald-400">{Math.floor(d.studied / 60)}s {d.studied % 60}d</span>{d.planned > 0 ? ` / ${Math.floor(d.planned / 60)}s` : ''}</>
                      : d.planned > 0 ? `Hedef: ${Math.floor(d.planned / 60)}s` : 'Yok'
                    }
                  </div>
                  <div className="w-1.5 h-1.5 bg-[#0f172a] rotate-45 mx-auto -mt-0.5" />
                </div>
                <div className="relative w-full flex items-end" style={{ height: '56px' }}>
                  {d.planned > 0 && <div className="absolute inset-x-0.5 bottom-0 rounded-md bg-[#e2e8f0]" style={{ height: '100%' }} />}
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: d.pct > 0 ? `${Math.max(10, d.pct)}%` : '3px' }}
                    transition={{ duration: 0.5, type: 'spring', bounce: 0.3, delay: i * 0.04 }}
                    className={`absolute inset-x-0.5 bottom-0 rounded-md ${d.isToday ? 'bg-[#2563eb]' : d.pct >= 100 ? 'bg-emerald-500' : 'bg-[#93c5fd]'}`}
                  />
                </div>
                <span className={`text-[9px] font-semibold ${d.isToday ? 'text-[#2563eb]' : 'text-[#94a3b8]'}`}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hızlı Başla */}
        <div className="md:col-span-4 rounded-xl border border-[#e2e8f0] bg-white overflow-hidden flex flex-col">
          <div className="px-3 py-2.5 border-b border-[#e2e8f0] flex items-center justify-between">
            <h3 className="text-[12px] font-bold text-[#0f172a] flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500" /> Hızlı Başla
            </h3>
          </div>
          {todayPlanItems.length > 0 && (
            <div className="px-3 pt-2 pb-1.5">
              <p className="text-[8px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1">Bugünün Planı</p>
              <div className="space-y-0.5">
                {todayPlanItems.slice(0, 3).map((planItem: any) => {
                  const subName = getSubjectName(planItem.subject_id)
                  const ex = exams.find(e => subjects.find(s => s.id === planItem.subject_id)?.exam_id === e.id)
                  return (
                    <button key={planItem.id} onClick={() => startFromPlan(planItem)}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded-lg border border-[#e2e8f0] hover:border-[#2563eb]/30 hover:bg-[#eff6ff] transition-all text-left group">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ex?.color ?? '#94a3b8' }} />
                      <span className="text-[10px] font-semibold text-[#0f172a] truncate flex-1">{subName}</span>
                      <Play className="h-2.5 w-2.5 text-[#2563eb] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="currentColor" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <button onClick={() => setQuickOpen(p => !p)} className="flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold text-[#64748b] hover:text-[#0f172a] transition-colors">
            <span>Sıfırdan başla</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${quickOpen ? 'rotate-180' : ''}`} />
          </button>
          {quickOpen && (
            <div className="px-3 pb-2 space-y-1.5 border-t border-[#f1f5f9] pt-1.5">
              <select value={quickExam} onChange={e => { setQuickExam(e.target.value); setQuickSubject(''); setQuickResource('') }}
                className="w-full h-7 rounded-lg border border-[#e2e8f0] bg-white px-2 text-[10px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30">
                <option value="">Sınav seç...</option>
                {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <select value={quickSubject} onChange={e => { setQuickSubject(e.target.value); setQuickResource('') }} disabled={!quickExam}
                className="w-full h-7 rounded-lg border border-[#e2e8f0] bg-white px-2 text-[10px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 disabled:opacity-50">
                <option value="">Ders seç...</option>
                {quickFilteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {quickSubject && quickFilteredResources.length > 0 && (
                <select value={quickResource} onChange={e => setQuickResource(e.target.value)}
                  className="w-full h-7 rounded-lg border border-[#e2e8f0] bg-white px-2 text-[10px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30">
                  <option value="">Kaynak (opsiyonel)</option>
                  {quickFilteredResources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
              <select value={quickMode} onChange={e => setQuickMode(e.target.value as any)}
                className="w-full h-7 rounded-lg border border-[#e2e8f0] bg-white px-2 text-[10px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30">
                <option value="pomodoro_long">Uzun ({pomSettings.long_focus_minutes}dk)</option>
                <option value="pomodoro_short">Kısa ({pomSettings.short_focus_minutes}dk)</option>
              </select>
              <button onClick={startQuick} disabled={!quickSubject}
                className="w-full h-7 rounded-lg bg-[#2563eb] text-white text-[10px] font-bold hover:bg-blue-600 disabled:opacity-40 transition-all flex items-center justify-center gap-1">
                <Play className="h-2.5 w-2.5" fill="currentColor" /> Başlat
              </button>
            </div>
          )}
          {todayPlanItems.length === 0 && !quickOpen && (
            <p className="text-center text-[10px] text-[#94a3b8] px-3 pb-2">Bugün için plan eklenmemiş.</p>
          )}
        </div>

        {/* Sınav Geri Sayım + Rapor */}
        <div className="md:col-span-3 flex md:flex-col gap-3">
          {/* Geri sayım */}
          <div className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-3 flex-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-bold text-[#0f172a] flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-[#2563eb]" /> Sınav Geri Sayım
              </h3>
              <select value={selectedCountdownExam} onChange={e => setSelectedCountdownExam(e.target.value)}
                className="h-6 rounded border border-[#e2e8f0] px-1 text-[9px] focus:outline-none">
                {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            {countdownDays !== null ? (
              <div className="text-center">
                <p className={`text-3xl font-black leading-none ${countdownDays <= 7 ? 'text-red-500' : countdownDays <= 30 ? 'text-orange-500' : 'text-[#0f172a]'}`}>
                  {countdownDays}
                </p>
                <p className="text-[10px] text-[#64748b] font-semibold mt-0.5">gün kaldı</p>
                {countdownExam && <p className="text-[9px] text-[#94a3b8] mt-0.5">{new Date(countdownExam.exam_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
              </div>
            ) : (
              <p className="text-[10px] text-[#94a3b8] text-center mt-2">Sınav tarihi ayarlardan girilmemiş.</p>
            )}
          </div>
          {/* Rapor indir */}
          <div className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-2.5 flex items-center gap-2">
            <button onClick={() => handleExportReport('pdf')} disabled={generating}
              className="flex-1 h-7 rounded-lg border border-[#e2e8f0] text-[10px] font-semibold text-[#0f172a] hover:bg-[#f8fafc] disabled:opacity-40 flex items-center justify-center gap-1">
              <Download className="h-3 w-3" /> PDF
            </button>
            <button onClick={() => handleExportReport('json')} disabled={generating}
              className="flex-1 h-7 rounded-lg border border-[#e2e8f0] text-[10px] font-semibold text-[#0f172a] hover:bg-[#f8fafc] disabled:opacity-40 flex items-center justify-center gap-1">
              <FileJson className="h-3 w-3" /> JSON
            </button>
          </div>
        </div>
      </motion.div>

      {/* ══ ROW 3 — Ders Dağılımı + Sınav Kartları ════ */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-12 gap-3 shrink-0">

        {/* Ders Dağılımı (Bu hafta) */}
        <div className="md:col-span-6 rounded-xl border border-[#e2e8f0] bg-white flex flex-col overflow-hidden max-h-72 min-h-[220px]">
          <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between shrink-0">
            <h3 className="text-[13px] font-bold text-[#0f172a] flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-[#2563eb]" /> Bu Hafta Ders Dağılımı
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {subjectBreakdown.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Clock className="h-7 w-7 text-[#e2e8f0] mb-1.5" />
                <p className="text-[11px] text-[#94a3b8]">Henüz çalışma kaydı yok.</p>
              </div>
            ) : subjectBreakdown.map((s, i) => {
              const maxMins = subjectBreakdown[0].mins
              const pct = Math.round((s.mins / maxMins) * 100)
              return (
                <div key={s.subId}>
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.examColor }} />
                      <span className="font-semibold text-[#0f172a] truncate">{s.name}</span>
                    </div>
                    <span className="font-bold text-[#0f172a] shrink-0 ml-1.5 text-[10px]">
                      {Math.floor(s.mins / 60) > 0 ? `${Math.floor(s.mins / 60)}sa ` : ''}{s.mins % 60}dk
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#f1f5f9] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, delay: i * 0.07, type: 'spring' }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: s.examColor }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sınav toplamları */}
        <div className="md:col-span-6 grid grid-cols-2 gap-2">
          {exams.map(ex => {
            const isStandard = !!examMeta[ex.name]
            const Icon = isStandard ? examMeta[ex.name].icon : Target
            const bgClass = isStandard ? `bg-gradient-to-br ${examMeta[ex.name].gradient}` : ''
            const bgStyle = !isStandard ? { backgroundColor: ex.color } : {}
            
            const mins = weekSessions.filter(s => subjects.find(sub => sub.id === s.subject_id)?.exam_id === ex.id).reduce((a, s) => a + s.duration_minutes, 0)
            const hours = Math.floor(mins / 60)
            const remMins = mins % 60
            return (
              <div key={ex.id} className="rounded-xl border border-[#e2e8f0] bg-white overflow-hidden hover:shadow-md transition-all flex flex-col">
                <div 
                  className={`${bgClass} px-2.5 py-2 flex items-center gap-2 shrink-0`}
                  style={bgStyle}
                >
                  <Icon className="h-4 w-4 text-white" />
                  <h3 className="font-bold text-white text-[12px]">{ex.name}</h3>
                </div>
                <div className="px-3 py-3 text-center flex-1 flex items-center justify-center">
                  <p className="text-2xl font-black text-[#0f172a] leading-none">
                    {hours}<span className="text-[12px] font-semibold text-[#94a3b8] ml-1">sa</span>{' '}
                    {remMins}<span className="text-[12px] font-semibold text-[#94a3b8] ml-1">dk</span>
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* ══ ROW 4 — Leaderboard & Dün Çalışılanlar ════ */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-12 gap-3 shrink-0">
        
        {/* Leaderboard (Günün En İyileri) */}
        <div className="md:col-span-8 rounded-xl border border-[#e2e8f0] bg-white flex flex-col overflow-hidden max-h-72">
          <div className="px-4 py-2.5 border-b border-[#e2e8f0] shrink-0 bg-[#f8fafc] flex items-center justify-between">
            <div>
              <h3 className="text-[12px] font-bold text-[#0f172a] flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-amber-500" /> Günün En İyileri
              </h3>
              <p className="text-[9px] text-[#64748b] mt-0.5">Bugün diğerlerinin ne çalıştığını gör.</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {leaderboard.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Trophy className="h-6 w-6 text-[#e2e8f0] mb-1.5" />
                <p className="text-[11px] text-[#94a3b8]">Henüz bugün çalışma yapan yok.</p>
              </div>
            ) : leaderboard.map((u, i) => (
              <div key={u.user_id} className="rounded-lg border border-[#e2e8f0] overflow-hidden bg-white">
                <button 
                  onClick={() => setExpandedUserId(expandedUserId === u.user_id ? null : u.user_id)}
                  className="w-full flex items-center justify-between p-3 hover:bg-[#f8fafc] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? 'bg-amber-100 text-amber-600' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-[#f1f5f9] text-[#64748b]'}`}>
                      {i + 1}
                    </div>
                    <div className="text-left">
                      <p className="text-[12px] font-bold text-[#0f172a] flex items-center gap-1.5">
                        {u.name} {u.user_id === impersonatedUserId && <span className="text-[9px] bg-indigo-100 text-indigo-600 px-1 rounded">(Sen)</span>}
                      </p>
                      {u.message && <p className="text-[10px] text-[#64748b] italic mt-0.5 flex items-center gap-1"><MessageSquare className="h-2.5 w-2.5" /> {u.message}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-black text-[#0f172a] bg-[#f1f5f9] px-2 py-1 rounded-md">
                      {Math.floor(u.total / 60) > 0 ? `${Math.floor(u.total / 60)}sa ` : ''}{u.total % 60}dk
                    </span>
                    {expandedUserId === u.user_id ? <ChevronDown className="h-4 w-4 text-[#94a3b8]" /> : <ChevronRight className="h-4 w-4 text-[#94a3b8]" />}
                  </div>
                </button>
                {expandedUserId === u.user_id && Object.keys(u.details).length > 0 && (
                  <div className="px-4 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] space-y-1.5">
                    {Object.entries(u.details).map(([k, mins]) => (
                      <div key={k} className="flex justify-between items-center text-[10px]">
                        <span className="font-semibold text-[#64748b]">{k}</span>
                        <span className="text-[#0f172a] font-bold">{Number(mins)} dk</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Dün Çalışılanlar — Tekrar Et (Spaced Repetition) */}
        <div className="md:col-span-4 rounded-xl border border-[#e2e8f0] bg-white flex flex-col overflow-hidden max-h-72">
          <div className="px-4 py-2.5 border-b border-[#e2e8f0] shrink-0">
            <h3 className="text-[12px] font-bold text-[#0f172a] flex items-center gap-1.5">
              <RotateCcw className="h-3.5 w-3.5 text-purple-500" /> Dün Çalışılanlar — Tekrar Et
            </h3>
            <p className="text-[9px] text-[#94a3b8] mt-0.5">Dün çalıştıklarını tekrar ederek kalıcılığı artır.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {yesterdayReview.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <RotateCcw className="h-6 w-6 text-[#e2e8f0] mb-1.5" />
                <p className="text-[11px] text-[#94a3b8]">Dün çalışma kaydı yok.</p>
              </div>
            ) : yesterdayReview.map((r, i) => {
              const subName = getSubjectName(r.subjectId)
              const resName = getResourceName(r.resourceId)
              const ex = exams.find(e => subjects.find(s => s.id === r.subjectId)?.exam_id === e.id)
              return (
                <button key={i} onClick={() => startReview(r.subjectId, r.resourceId)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#e2e8f0] hover:border-purple-200 hover:bg-purple-50/30 transition-all text-left group">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ex?.color ?? '#94a3b8' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-[#0f172a] truncate">{subName}</p>
                    {resName && <p className="text-[9px] text-[#94a3b8] truncate">{resName}</p>}
                  </div>
                  <span className="text-[9px] font-bold text-[#94a3b8]">{r.mins}dk</span>
                  <Play className="h-3 w-3 text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="currentColor" />
                </button>
              )
            })}
          </div>
        </div>
      </motion.div>

      {/* ══ ROW 5 — Admin Kelime Kopyalama Paneli ════ */}
      {isAdmin && (
        <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-12 gap-3 shrink-0">
          <div className="md:col-span-12 rounded-xl border border-[#e2e8f0] bg-white p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-[#0f172a] flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-indigo-500" /> Admin YKS/YDT Kelime Kopyalama Paneli
                </h3>
                <p className="text-[11px] text-[#64748b] mt-0.5">Öğrencilerinize göndermek üzere gün seçip kelimeleri panoya kopyalayın.</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex-1 max-w-[200px]">
                <select 
                  value={selectedVocabDay} 
                  onChange={e => setSelectedVocabDay(e.target.value ? Number(e.target.value) : '')}
                  className="w-full h-9 rounded-lg border border-[#e2e8f0] bg-white px-3 text-[12px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer"
                >
                  <option value="">Gün Seçiniz...</option>
                  {availableDays.map(d => (
                    <option key={d} value={d}>Day {d}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleCopyVocab}
                disabled={!selectedVocabDay}
                className="h-9 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[12px] font-bold disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:shadow"
              >
                <Copy className="h-4 w-4" /> Kelimeleri Kopyala
              </button>
            </div>
          </div>
        </motion.div>
      )}

      </div>{/* end desktop layout */}
    </motion.div>
  )
}

