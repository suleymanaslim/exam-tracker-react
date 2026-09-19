import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  Calendar, Plus, Trash2, Copy, ChevronLeft, ChevronRight, Clock,
  Shield, Globe, BookOpen, Calculator, Target, Database,
} from 'lucide-react'
import Swal from 'sweetalert2'
import type { LucideIcon } from 'lucide-react'
import { useAdminStore } from '../lib/adminStore'
import { useSettingsStore } from '../lib/settingsStore'

/* ── Tipler ── */
interface Exam { id: string; name: string; color: string }
interface Subject { id: string; exam_id: string; name: string }
interface Resource { id: string; subject_id: string; name: string; resource_type: string }
interface PlanItem {
  id: string; weekly_plan_id: string; day_of_week: number
  subject_id: string | null; resource_id: string | null
  title: string | null; planned_minutes: number; sort_order: number
}

const dayNames = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const dayShort = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

const examIcons: Record<string, LucideIcon> = {
  AGS: Shield, 'YDS/YÖKDİL': Globe, IELTS: BookOpen, ALES: Calculator,
}

/* ── Hafta hesaplama ── */
function getMonday(d: Date) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function formatDate(d: Date) {
  return d.toISOString().split('T')[0]
}

function formatDateTR(d: Date) {
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
}

export default function Plan() {
  const { impersonatedUserId } = useAdminStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [exams, setExams] = useState<Exam[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [planId, setPlanId] = useState<string | null>(null)
  const [items, setItems] = useState<PlanItem[]>([])
  const [videoItems, setVideoItems] = useState<any[]>([])
  const { offDay } = useSettingsStore()
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date().getDay()
    return today === 0 ? 7 : today // 1=Pzt ... 7=Paz
  })

  // Form state
  const [selExam, setSelExam] = useState('')
  const [selSubject, setSelSubject] = useState('')
  const [selResource, setSelResource] = useState('')
  const [selHours, setSelHours] = useState(0)
  const [selMinutes, setSelMinutes] = useState(30)
  const [selTitle, setSelTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 6)
    return d
  }, [weekStart])

  // Load user & data
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const targetUid = impersonatedUserId || user.id
        setUserId(targetUid)
        loadData(targetUid)
      }
    })
  }, [impersonatedUserId])

  const loadData = async (uid: string) => {
    supabase.from('exams').select('*').eq('user_id', uid).then(r => r.data && setExams(r.data))
    supabase.from('subjects').select('*').eq('user_id', uid).then(r => r.data && setSubjects(r.data))
    supabase.from('resources').select('*').eq('user_id', uid).then(r => r.data && setResources(r.data))
  }

  // Load/create weekly plan
  useEffect(() => {
    if (!userId) return
    const ws = formatDate(weekStart)
    
    // Calculate week dates
    const weekDates = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return formatDate(d)
    })

    const loadPlan = async () => {
      // 1. Haftalık plan ve normal plan maddeleri
      const { data } = await supabase
        .from('weekly_plans')
        .select('*')
        .eq('user_id', userId)
        .eq('week_start_date', ws)
        .single()
        
      if (data) {
        setPlanId(data.id)
        const { data: pi } = await supabase.from('plan_items').select('*').eq('weekly_plan_id', data.id).order('sort_order')
        setItems(pi ?? [])
      } else {
        const { data: np } = await supabase.from('weekly_plans').insert({ user_id: userId, week_start_date: ws }).select().single()
        if (np) { setPlanId(np.id); setItems([]) }
      }

      // 2. Video plan maddeleri
      const { data: vpi } = await supabase
        .from('video_plan_items')
        .select('*')
        .eq('user_id', userId)
        .in('date', weekDates)
      setVideoItems(vpi ?? [])
    }
    loadPlan()
  }, [userId, weekStart])

  // Filtered selects
  const filteredSubjects = subjects.filter(s => s.exam_id === selExam)
  const filteredResources = resources.filter(r => r.subject_id === selSubject)

  const selectedDateStr = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + (selectedDay - 1))
    return formatDate(d)
  }, [weekStart, selectedDay])

  const dayVideoItems = videoItems.filter(v => v.date === selectedDateStr).map(v => {
    const res = resources.find((r: any) => r.id === v.resource_id) as any
    return {
      id: 'vpi_' + v.id,
      weekly_plan_id: 'video',
      day_of_week: selectedDay,
      subject_id: res?.subject_id || null,
      resource_id: v.resource_id,
      title: `${v.video_count} Video (Video Planı)`,
      planned_minutes: v.video_count * (res?.avg_video_duration || 0),
      sort_order: -1,
      isVideo: true,
      originalId: v.id
    }
  })

  const regularDayItems = items.filter(i => i.day_of_week === selectedDay)
  const dayItems = [...dayVideoItems, ...regularDayItems]
  const dayTotalMin = dayItems.reduce((s, i) => s + i.planned_minutes, 0)

  // Subject -> Exam lookup
  const subjectToExam = useMemo(() => {
    const map: Record<string, string> = {}
    subjects.forEach(s => { map[s.id] = s.exam_id })
    return map
  }, [subjects])

  const getExamForSubject = (subjectId: string | null) => {
    if (!subjectId) return null
    const examId = subjectToExam[subjectId]
    return exams.find(e => e.id === examId) ?? null
  }

  const getSubjectName = (id: string | null) => subjects.find(s => s.id === id)?.name ?? ''
  const getResourceName = (id: string | null) => resources.find(r => r.id === id)?.name ?? ''

  // Add item
  const handleAdd = async () => {
    if (!planId || !userId || selectedDay === offDay) return
    setSaving(true)
    const { data } = await supabase.from('plan_items').insert({
      user_id: userId,
      weekly_plan_id: planId,
      day_of_week: selectedDay,
      subject_id: selSubject || null,
      resource_id: selResource || null,
      title: selTitle || null,
      planned_minutes: (selHours * 60) + selMinutes,
      sort_order: dayItems.length,
    }).select().single()
    if (data) setItems(prev => [...prev, data])
    setSelExam(''); setSelSubject(''); setSelResource(''); setSelHours(0); setSelMinutes(30); setSelTitle('')
    setSaving(false)
  }

  // Delete item
  const handleDelete = async (id: string, isVideo?: boolean) => {
    const res = await Swal.fire({
      title: 'Planı Sil',
      text: 'Bu plan maddesini silmek istediğinize emin misiniz?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Evet, Sil',
      cancelButtonText: 'İptal'
    })
    if (!res.isConfirmed) return
    
    if (isVideo || id.startsWith('vpi_')) {
      const originalId = id.replace('vpi_', '')
      await supabase.from('video_plan_items').delete().eq('id', originalId)
      setVideoItems(prev => prev.filter(i => i.id !== originalId))
    } else {
      await supabase.from('plan_items').delete().eq('id', id)
      setItems(prev => prev.filter(i => i.id !== id))
    }
  }

  // Copy last week
  const handleCopyLastWeek = async () => {
    if (!userId || !planId) return
    const lastMonday = new Date(weekStart)
    lastMonday.setDate(lastMonday.getDate() - 7)
    const { data: lastPlan } = await supabase.from('weekly_plans').select('id').eq('user_id', userId).eq('week_start_date', formatDate(lastMonday)).single()
    if (!lastPlan) { alert('Geçen hafta plan bulunamadı.'); return }
    const { data: lastItems } = await supabase.from('plan_items').select('*').eq('weekly_plan_id', lastPlan.id)
    if (!lastItems || lastItems.length === 0) { alert('Geçen hafta planı boş.'); return }
    const newItems = lastItems.map(i => ({
      user_id: userId,
      weekly_plan_id: planId,
      day_of_week: i.day_of_week,
      subject_id: i.subject_id,
      resource_id: i.resource_id,
      title: i.title,
      planned_minutes: i.planned_minutes,
      sort_order: i.sort_order,
    }))
    const { data: inserted } = await supabase.from('plan_items').insert(newItems).select()
    if (inserted) setItems(prev => [...prev, ...inserted])
  }

  // Load Example Plan (JSON)
  const loadExamplePlan = async () => {
    if (!userId || !planId) return
    const res = await Swal.fire({
      title: 'Örnek Planı Yükle',
      text: 'Bu haftanın mevcut planını silip örnek planı yüklemek istediğine emin misin?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Evet, Yükle',
      cancelButtonText: 'İptal'
    })
    if (!res.isConfirmed) return
    
    // Clear current items
    await supabase.from('plan_items').delete().eq('weekly_plan_id', planId)
    setItems([])

    const subjectMap: Record<string, string> = {}
    subjects.forEach(s => subjectMap[s.name] = s.id)
    const resourceMap: Record<string, string> = {}
    resources.forEach(r => resourceMap[r.name] = r.id)

    const planData = [
      { day: 1, subject: 'Eğitim Bilimleri ve Türk Milli Eğitim Sistemi', resource: 'MEB-AGS Eğitim Bilimleri ve Türk Milli Eğitim Sistemi Video Ders Notları', title: 'Video ders', minutes: 90 },
      { day: 1, subject: 'Mevzuat Bilgisi', resource: 'MEB-AGS Mevzuat Bilgisi Video Ders Notları', title: 'Video ders', minutes: 90 },
      { day: 1, subject: 'Kelime Çalışması', resource: '60 Günde YDS Kelimeleri', title: 'Günlük 30-40 kelime', minutes: 60 },
      { day: 1, subject: 'Kelime Çalışması', resource: 'Vocabulary Kaynağı', title: 'Vocabulary pratiği', minutes: 30 },
      { day: 2, subject: 'YDS/YÖKDİL Genel', resource: 'Makalelerle YDS', title: 'Okuma + çeviri', minutes: 90 },
      { day: 2, subject: 'YDS/YÖKDİL Genel', resource: 'Geçmiş YDS Sınavları', title: 'Soru çözümü', minutes: 60 },
      { day: 2, subject: 'Listening', resource: 'IELTS Liz', title: 'Focused listening pratiği', minutes: 60 },
      { day: 2, subject: 'Reading', resource: 'IELTS Official Cambridge Guide', title: 'Reading pratiği', minutes: 60 },
      { day: 3, subject: 'Tarih', resource: 'MEB AGS Tarih Video Ders Notları', title: 'Video ders', minutes: 90 },
      { day: 3, subject: 'Türkiye Coğrafyası', resource: 'MEB AGS Türkiye Coğrafyası Video Ders Notları', title: 'Video ders', minutes: 90 },
      { day: 3, subject: 'Kelime Çalışması', resource: '60 Günde YDS Kelimeleri', title: 'Önceki günün kelime tekrarı', minutes: 60 },
      { day: 3, subject: 'Kelime Çalışması', resource: 'Vocabulary Kaynağı', title: 'Vocabulary pratiği', minutes: 30 },
      { day: 4, subject: 'Temel Matematik', resource: 'Yediiklim Temel Matematik', title: 'Konu çalışması', minutes: 120 },
      { day: 4, subject: 'Sayısal Yetenek', resource: 'MEB AGS Sayısal Yetenek Video Ders Notları', title: 'Video ders', minutes: 90 },
      { day: 4, subject: null, resource: null, title: 'Karma soru çözümü (Matematik + Sayısal Yetenek)', minutes: 60 },
      { day: 5, subject: 'YDS/YÖKDİL Genel', resource: 'Geçmiş YDS Sınavları', title: 'Haftalık deneme sınavı + değerlendirme', minutes: 120 },
      { day: 5, subject: 'Speaking', resource: 'IELTS Liz', title: 'Speaking pratiği', minutes: 60 },
      { day: 5, subject: 'Writing', resource: 'IELTS Official Cambridge Guide', title: 'Writing pratiği', minutes: 90 },
      { day: 6, subject: 'Paragraf / Sözel', resource: 'Pegem Paragraf', title: 'Paragraf çalışması', minutes: 90 },
      { day: 6, subject: 'Sözel Yetenek', resource: 'MEB AGS Sözel Yetenek Video Ders Notları', title: 'Video ders', minutes: 90 },
      { day: 6, subject: null, resource: null, title: 'Haftalık genel tekrar + karışık soru bankası', minutes: 90 },
    ]

    const newItems = planData.map((item, i) => ({
      user_id: userId,
      weekly_plan_id: planId,
      day_of_week: item.day,
      subject_id: item.subject ? (subjectMap[item.subject] ?? null) : null,
      resource_id: item.resource ? (resourceMap[item.resource] ?? null) : null,
      title: item.title,
      planned_minutes: item.minutes,
      sort_order: i,
    }))

    const { data: inserted } = await supabase.from('plan_items').insert(newItems).select()
    if (inserted) setItems(inserted)
  }


  // Navigate weeks
  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d) }
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d) }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold text-[#0f172a] flex items-center gap-2">
            <Calendar className="h-5 w-5 text-[#2563eb]" /> Haftalık Plan
          </h1>
          <p className="text-[12px] text-[#64748b]">
            <span className="hidden md:inline">Çalışma planını gün gün oluştur ve yönet.</span>
            <span className="md:hidden">Bu haftanın planını görüntüle.</span>
          </p>
        </div>
        {/* Desktop only buttons */}
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={loadExamplePlan}
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[12px] font-medium text-orange-700 hover:bg-orange-100 transition-all"
          >
            <Database className="h-3.5 w-3.5" /> Örnek Planı Yükle
          </button>
          <button
            onClick={handleCopyLastWeek}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-[12px] font-medium text-[#0f172a] hover:bg-[#f8fafc] transition-all"
          >
            <Copy className="h-3.5 w-3.5" /> Geçen Haftayı Kopyala
          </button>
        </div>
      </div>

      {/* Week nav */}
      <div className="flex items-center justify-center gap-3 shrink-0">
        <button onClick={prevWeek} className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#e2e8f0] bg-white hover:bg-[#f8fafc]">
          <ChevronLeft className="h-4 w-4 text-[#64748b]" />
        </button>
        <span className="text-[13px] font-semibold text-[#0f172a]">
          {formatDateTR(weekStart)} — {formatDateTR(weekEnd)}
        </span>
        <button onClick={nextWeek} className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#e2e8f0] bg-white hover:bg-[#f8fafc]">
          <ChevronRight className="h-4 w-4 text-[#64748b]" />
        </button>
      </div>

      {/* Day tabs */}
      <div className="flex md:grid md:grid-cols-7 overflow-x-auto gap-1.5 shrink-0 pb-2 md:pb-0">
        {dayShort.map((d, i) => {
          const dayNum = i + 1
          const count = items.filter(it => it.day_of_week === dayNum).length
          const isOffDay = dayNum === offDay
          const isActive = selectedDay === dayNum
          return (
            <button
              key={d}
              onClick={() => setSelectedDay(dayNum)}
              disabled={isOffDay}
              className={`min-w-[64px] flex-1 rounded-lg py-2 text-center transition-all font-medium flex flex-col items-center justify-center ${
                isOffDay
                  ? 'bg-red-50 text-red-300 cursor-not-allowed border border-red-100'
                  : isActive
                    ? 'bg-[#0a1628] text-white shadow-md'
                    : 'bg-white border border-[#e2e8f0] text-[#64748b] hover:border-[#2563eb]/30 hover:text-[#0f172a]'
              }`}
            >
              <div className="text-[12px]">{d}</div>
              {isOffDay ? (
                <div className="text-[9px] mt-0.5">OFF</div>
              ) : (
                <div className="text-[9px] mt-0.5 opacity-70">{count} görev</div>
              )}
            </button>
          )
        })}
      </div>

      {/* ── MOBİL: Sadece görüntüleme ─────────────────────────────── */}
      <div className="md:hidden flex-1 overflow-y-auto">
        <div className="rounded-lg border border-[#e2e8f0] bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#e2e8f0] px-4 py-3">
            <h3 className="text-[13px] font-bold text-[#0f172a]">
              {dayNames[selectedDay - 1]} {selectedDay === offDay && '(OFF)'}
            </h3>
            <span className="text-[11px] font-medium text-[#64748b] flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {Math.floor(dayTotalMin / 60)} sa {dayTotalMin % 60} dk
            </span>
          </div>
          <div className="p-3 space-y-2">
            {selectedDay === offDay ? (
              <div className="flex flex-col items-center justify-center py-10 text-[#94a3b8] text-[13px]">
                <Calendar className="h-8 w-8 mb-2 opacity-40" />
                {dayNames[offDay - 1]} günü dinlenme günü 😴
              </div>
            ) : dayItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-[#94a3b8] text-[13px]">
                <Plus className="h-8 w-8 mb-2 opacity-40" />
                Bu gün için plan eklenmemiş.
              </div>
            ) : (
              dayItems.map((item) => {
                const exam = getExamForSubject(item.subject_id)
                const ExamIcon = exam ? (examIcons[exam.name] ?? Target) : Target
                return (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[#e2e8f0] p-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ backgroundColor: exam?.color ?? '#64748b' }}
                    >
                      <ExamIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#0f172a] truncate">
                        {item.title || getSubjectName(item.subject_id)}
                      </p>
                      <p className="text-[11px] text-[#94a3b8] truncate">
                        {getResourceName(item.resource_id)} · {item.planned_minutes} dk
                      </p>
                    </div>
                    <span className="text-[11px] font-bold text-[#64748b] shrink-0 bg-[#f1f5f9] px-2 py-1 rounded-lg">
                      {item.planned_minutes}dk
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ── DESKTOP: Tam düzenleme paneli ─────────────────────────── */}
      <div className="hidden md:flex flex-1 min-h-0 flex-col-reverse lg:grid lg:grid-cols-5 gap-3 overflow-y-auto lg:overflow-hidden pb-4 lg:pb-0">
        {/* Left: item list */}
        <div className="lg:col-span-3 rounded-lg border border-[#e2e8f0] bg-white flex flex-col overflow-hidden min-h-[300px] lg:min-h-0">
          <div className="flex items-center justify-between border-b border-[#e2e8f0] px-4 py-2 shrink-0">
            <h3 className="text-[12px] font-bold text-[#0f172a]">
              {dayNames[selectedDay - 1]} {selectedDay === offDay && '(OFF)'}
            </h3>
            <span className="text-[10px] font-medium text-[#64748b] flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Toplam: {Math.floor(dayTotalMin / 60)} sa {dayTotalMin % 60} dk
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {selectedDay === offDay ? (
              <div className="flex flex-col items-center justify-center h-full text-[#94a3b8] text-[13px]">
                <Calendar className="h-8 w-8 mb-2 opacity-40" />
                {dayNames[offDay - 1]} günü dinlenme günü 😴
              </div>
            ) : dayItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[#94a3b8] text-[13px]">
                <Plus className="h-8 w-8 mb-2 opacity-40" />
                Henüz görev eklenmemiş.
              </div>
            ) : (
              dayItems.map((item) => {
                const exam = getExamForSubject(item.subject_id)
                const ExamIcon = exam ? (examIcons[exam.name] ?? Target) : Target
                return (
                  <div key={item.id} className="flex items-center gap-3 rounded-lg border border-[#e2e8f0] p-3 hover:shadow-sm transition-all group">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: exam?.color ?? '#64748b' }}
                    >
                      <ExamIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[#0f172a] truncate">
                        {item.title || getSubjectName(item.subject_id)}
                      </p>
                      <p className="text-[10px] text-[#94a3b8] truncate">
                        {getResourceName(item.resource_id)} · {item.planned_minutes} dk
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right: Add form */}
        <div className="lg:col-span-2 rounded-lg border border-[#e2e8f0] bg-white flex flex-col overflow-hidden shrink-0">
          <div className="border-b border-[#e2e8f0] px-4 py-2 shrink-0">
            <h3 className="text-[12px] font-bold text-[#0f172a] flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5 text-[#2563eb]" /> Görev Ekle
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {selectedDay === offDay ? (
              <div className="flex items-center justify-center h-full text-[13px] text-[#94a3b8]">{dayNames[offDay - 1]} günü OFF</div>
            ) : (
              <>
                {/* Sınav */}
                <div>
                  <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Sınav</label>
                  <select
                    value={selExam}
                    onChange={e => { setSelExam(e.target.value); setSelSubject(''); setSelResource('') }}
                    className="mt-1 w-full h-9 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[12px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                  >
                    <option value="">Seçiniz...</option>
                    {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                {/* Ders */}
                <div>
                  <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Ders</label>
                  <select
                    value={selSubject}
                    onChange={e => { setSelSubject(e.target.value); setSelResource('') }}
                    disabled={!selExam}
                    className="mt-1 w-full h-9 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[12px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 disabled:opacity-50"
                  >
                    <option value="">Seçiniz...</option>
                    {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                {/* Kaynak */}
                <div>
                  <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Kaynak</label>
                  <select
                    value={selResource}
                    onChange={e => setSelResource(e.target.value)}
                    disabled={!selSubject}
                    className="mt-1 w-full h-9 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[12px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 disabled:opacity-50"
                  >
                    <option value="">Seçiniz (opsiyonel)...</option>
                    {filteredResources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                {/* Başlık */}
                <div>
                  <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Not / Başlık</label>
                  <input
                    type="text"
                    value={selTitle}
                    onChange={e => setSelTitle(e.target.value)}
                    placeholder="ör. 30 kelime çalış"
                    className="mt-1 w-full h-9 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[12px] text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                  />
                </div>
                {/* Süre */}
                <div>
                  <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Süre</label>
                  <div className="flex gap-2 mt-1">
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="number" min={0} value={selHours}
                        onChange={e => setSelHours(Number(e.target.value))}
                        className="w-full h-9 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[12px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                      />
                      <span className="text-[12px] text-[#64748b]">sa</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="number" min={0} step={5} value={selMinutes}
                        onChange={e => setSelMinutes(Number(e.target.value))}
                        className="w-full h-9 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[12px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                      />
                      <span className="text-[12px] text-[#64748b]">dk</span>
                    </div>
                  </div>
                </div>
                {/* Submit */}
                <button
                  onClick={handleAdd}
                  disabled={!selSubject || saving}
                  className="w-full h-9 rounded-lg bg-[#0a1628] text-white text-[12px] font-semibold transition-all hover:bg-[#1a365d] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {saving ? 'Ekleniyor...' : 'Plana Ekle'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
