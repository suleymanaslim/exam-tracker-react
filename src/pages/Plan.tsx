import './Plan.css'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  Calendar, Plus, Trash2, Copy, ChevronLeft, ChevronRight, Clock,
  Shield, Globe, BookOpen, Calculator, Target, Database, PlayCircle
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

function planDuration(minutes: number) {
  const value=Math.max(0,Math.round(minutes))
  return value>=60?`${Math.floor(value/60)} sa${value%60?` ${value%60} dk`:''}`:`${value} dk`
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
    const sub = subjects.find((s: any) => s.id === res?.subject_id) as any
    
    let cleanName = (res?.name || sub?.name || 'Video').replace(/MEB-AGS|MEB AGS/g, '').trim()
    
    return {
      id: 'vpi_' + v.id,
      weekly_plan_id: 'video',
      day_of_week: selectedDay,
      subject_id: res?.subject_id || null,
      resource_id: v.resource_id,
      title: `${cleanName} ${v.video_count}`,
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
    <div className="weekly-plan">
      <header className="plan-header"><div><p className="plan-eyebrow">HAFTANI DÜZENLE</p><h1>Haftalık Plan</h1><p>Çalışmalarını gün gün planla, hedeflerine yer aç.</p></div><div className="plan-actions plan-desktop"><button onClick={handleCopyLastWeek}><Copy size={16}/>Geçen haftayı kopyala</button><button onClick={loadExamplePlan}><Database size={16}/>Örnek planı yükle</button></div></header>
      <section className="plan-week-picker" aria-label="Hafta seçimi"><button onClick={prevWeek} aria-label="Önceki hafta"><ChevronLeft size={18}/></button><div><span>SEÇİLİ HAFTA</span><strong>{formatDateTR(weekStart)} — {formatDateTR(weekEnd)}</strong></div><button onClick={nextWeek} aria-label="Sonraki hafta"><ChevronRight size={18}/></button></section>
      <div className="plan-days" role="tablist" aria-label="Haftanın günleri">{dayShort.map((d,i)=>{
        const dayNum=i+1;const date=new Date(weekStart);date.setDate(date.getDate()+i);const dateStr=formatDate(date);const regular=items.filter(p=>p.day_of_week===dayNum);const videos=videoItems.filter(p=>p.date===dateStr);const minutes=regular.reduce((sum,p)=>sum+p.planned_minutes,0)+videos.reduce((sum,v)=>sum+v.video_count*((resources.find(r=>r.id===v.resource_id) as any)?.avg_video_duration||0),0);const count=regular.length+videos.length;const off=dayNum===offDay;
        return <button key={d} role="tab" id={`plan-tab-${dayNum}`} aria-selected={selectedDay===dayNum} aria-controls="plan-day-content" disabled={off} onClick={()=>setSelectedDay(dayNum)} className={`${selectedDay===dayNum?'is-active':''} ${off?'is-off':''}`}><span className="plan-day-name">{d}</span><strong>{date.getDate()}</strong><span>{off?'Dinlenme':count?`${count} çalışma`:'Plan yok'}</span><small>{off?'—':planDuration(minutes)}</small></button>
      })}</div>
      <div className="plan-grid">
        <section className="plan-card plan-day-content" id="plan-day-content" role="tabpanel" aria-labelledby={`plan-tab-${selectedDay}`}>
          <div className="plan-card-head"><div><p className="plan-eyebrow">GÜNLÜK PROGRAM</p><h2>{dayNames[selectedDay-1]}</h2></div><span className="plan-total"><Clock size={15}/>{planDuration(dayTotalMin)}</span></div>
          <div className="plan-list">{selectedDay===offDay?<div className="plan-empty"><Calendar size={28}/><h3>Dinlenme günü</h3><p>Bugün kendine zaman ayır.</p></div>:dayItems.length===0?<div className="plan-empty"><Calendar size={28}/><h3>Günün planı henüz boş</h3><p>Eklediğin dersler ve video planların burada sıralanır.</p></div>:dayItems.map((item,index)=>{const exam=getExamForSubject(item.subject_id);const video=!!(item as any).isVideo;const Icon=video?PlayCircle:examIcons[exam?.name||'']||Target;return <div key={item.id} className="plan-row"><span className="plan-row-index">{String(index+1).padStart(2,'0')}</span><span className="plan-row-icon"><Icon size={18}/></span><div className="plan-row-copy"><strong>{item.title||getSubjectName(item.subject_id)||'Çalışma'}</strong><span>{getResourceName(item.resource_id)||exam?.name||'Genel çalışma'}</span></div><div className="plan-row-time"><small>{video?'Video':'Ders'}</small><strong>{planDuration(item.planned_minutes)}</strong></div><button className="plan-delete plan-desktop" onClick={()=>handleDelete(item.id)} aria-label={`${item.title||getSubjectName(item.subject_id)} planını sil`} title="Plan maddesini sil"><Trash2 size={16}/></button></div>})}</div>
          <div className="plan-list-footer"><span>{dayItems.length} çalışma</span><span>Günlük hedef <b>{planDuration(dayTotalMin)}</b></span></div>
        </section>
        <section className="plan-card plan-form-card plan-desktop"><div className="plan-card-head"><div><p className="plan-eyebrow">PLANINA EKLE</p><h2>Yeni çalışma</h2></div><Plus size={20}/></div>{selectedDay===offDay?<div className="plan-empty"><p>Dinlenme günü için çalışma eklenemez.</p></div>:<form className="plan-form" onSubmit={e=>{e.preventDefault();handleAdd()}}>
          <label>Sınav<select value={selExam} onChange={e=>{setSelExam(e.target.value);setSelSubject('');setSelResource('')}}><option value="">Sınav seç</option>{exams.map(ex=><option key={ex.id} value={ex.id}>{ex.name}</option>)}</select></label>
          <label>Ders<select value={selSubject} disabled={!selExam} onChange={e=>{setSelSubject(e.target.value);setSelResource('')}}><option value="">Ders seç</option>{filteredSubjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Kaynak <span>isteğe bağlı</span><select value={selResource} disabled={!selSubject} onChange={e=>setSelResource(e.target.value)}><option value="">Kaynak seç</option>{filteredResources.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label>Not / Başlık <span>isteğe bağlı</span><input value={selTitle} onChange={e=>setSelTitle(e.target.value)} placeholder="Örn. konu tekrarı veya 30 kelime"/></label>
          <fieldset><legend>Çalışma süresi</legend><div className="plan-duration"><label><input aria-label="Saat" type="number" min={0} value={selHours} onChange={e=>setSelHours(Number(e.target.value))}/><span>saat</span></label><label><input aria-label="Dakika" type="number" min={0} step={5} value={selMinutes} onChange={e=>setSelMinutes(Number(e.target.value))}/><span>dakika</span></label></div></fieldset>
          <button className="plan-submit" disabled={!selSubject||saving}><Plus size={16}/>{saving?'Ekleniyor…':'Plana ekle'}</button>
        </form>}</section>
      </div>
    </div>
  )
}
