import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  Plus, Trash2, Calendar as CalendarIcon, Download, Clock,
  Image as ImageIcon, Settings, EyeOff, SkipForward, X,
  ChevronLeft, ChevronRight, PlayCircle, GripVertical, Check
} from 'lucide-react'
import Swal from 'sweetalert2'
import html2canvas from 'html2canvas'
import { useAdminStore } from '../lib/adminStore'
import { AnimatePresence, motion } from 'framer-motion'

/* ─────────────── Types ─────────────── */
interface Resource {
  id: string; subject_id: string; name: string; resource_type: string
  total_videos: number; avg_video_duration: number; subject_name?: string
}
interface VideoPlanItem {
  id: string; resource_id: string; date: string; video_count: number;
  watched_count?: number; is_completed?: boolean;
}

/* ─────────────── Color Palette ─────────────── */
const PALETTE = [
  { bg: '#dbeafe', card: '#eff6ff', text: '#1e40af', accent: '#3b82f6', dot: '#2563eb' },
  { bg: '#d1fae5', card: '#ecfdf5', text: '#065f46', accent: '#10b981', dot: '#059669' },
  { bg: '#fde68a', card: '#fefce8', text: '#92400e', accent: '#f59e0b', dot: '#d97706' },
  { bg: '#ddd6fe', card: '#f5f3ff', text: '#5b21b6', accent: '#8b5cf6', dot: '#7c3aed' },
  { bg: '#fecdd3', card: '#fff1f2', text: '#9f1239', accent: '#f43f5e', dot: '#e11d48' },
  { bg: '#c7d2fe', card: '#eef2ff', text: '#3730a3', accent: '#6366f1', dot: '#4f46e5' },
  { bg: '#99f6e4', card: '#f0fdfa', text: '#115e59', accent: '#14b8a6', dot: '#0d9488' },
  { bg: '#fbcfe8', card: '#fdf2f8', text: '#9d174d', accent: '#ec4899', dot: '#db2777' },
]

function hashColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h)
  return PALETTE[Math.abs(h) % PALETTE.length]
}

function cleanName(n: string) {
  return (n || '').replace(/MEB[-\s]?AGS/gi, '').trim()
}

function localDateStr(d: Date) {
  const offset = d.getTimezoneOffset()
  const adjusted = new Date(d.getTime() - offset * 60_000)
  return adjusted.toISOString().split('T')[0]
}

function getMonday(d: Date) {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(date.setDate(diff))
}

function fmtMinutes(m: number) {
  if (m <= 0) return '0dk'
  const h = Math.floor(m / 60)
  const r = Math.round(m % 60)
  if (h > 0 && r > 0) return `${h}sa ${r}dk`
  if (h > 0) return `${h}sa`
  return `${r}dk`
}

/* ─────────────── Component ─────────────── */
export default function VideoPlan() {
  const { impersonatedUserId } = useAdminStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [allResources, setAllResources] = useState<Resource[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [planItems, setPlanItems] = useState<VideoPlanItem[]>([])
  const [loading, setLoading] = useState(true)

  const calendarRef = useRef<HTMLDivElement>(null)

  /* editing */
  const [editingRes, setEditingRes] = useState<Resource | null>(null)
  const [editTotal, setEditTotal] = useState('')
  const [editAvg, setEditAvg] = useState('')

  /* selection */
  const [selectedResId, setSelectedResId] = useState<string | null>(null)

  /* drag */
  const [dragSourceDate, setDragSourceDate] = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  /* calendar start */
  const [startDate, setStartDate] = useState(getMonday(new Date()))

  const days = Array.from({ length: 35 }).map((_, i) => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    return d
  })

  /* ─── Data ─── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const uid = impersonatedUserId || user.id
        setUserId(uid)
        loadData(uid)
      }
    })
  }, [impersonatedUserId])

  const loadData = async (uid: string) => {
    setLoading(true)
    
    
    const [resR, planR, subR] = await Promise.all([
      supabase.from('resources').select('*').eq('user_id', uid),
      supabase.from('video_plan_items').select('*').eq('user_id', uid),
      supabase.from('subjects').select('id, name').eq('user_id', uid),
    ])
    if (resR.data && subR.data) {
      const merged = resR.data.map(r => ({
        ...r,
        subject_name: subR.data.find(s => s.id === r.subject_id)?.name || 'Bilinmeyen Ders',
      }))
      setAllResources(merged)
      setResources(merged.filter(r => r.resource_type === 'video_ders'))
    }
    if (planR.data) setPlanItems(planR.data)
    setLoading(false)
  }

  /* ─── Handlers ─── */

  const handleDayClick = async (dateObj: Date) => {
    if (!userId || !selectedResId) {
      Swal.fire({ title: 'Kaynak Seçin', text: 'Takvime eklemek için sol panelden bir kaynak seçin.', icon: 'info', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 })
      return
    }
    const dateStr = localDateStr(dateObj)
    const res = resources.find(r => r.id === selectedResId)
    if (!res) return

    const { value: countStr } = await Swal.fire({
      title: 'Kaç Video?',
      text: `${cleanName(res.name)} → ${dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`,
      input: 'number',
      inputAttributes: { min: '1', step: '1' },
      inputValue: '3',
      showCancelButton: true,
      confirmButtonText: 'Ekle',
      cancelButtonText: 'Vazgeç',
      confirmButtonColor: '#2563eb',
    })
    if (countStr && parseInt(countStr) > 0) {
      const { data } = await supabase.from('video_plan_items').insert({
        user_id: userId, resource_id: selectedResId,
        date: dateStr, video_count: parseInt(countStr),
      }).select().single()
      if (data) setPlanItems(p => [...p, data])
    }
  }

  const handleDeleteItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await supabase.from('video_plan_items').delete().eq('id', id)
    setPlanItems(p => p.filter(i => i.id !== id))
  }

  const handleClearDay = async (e: React.MouseEvent, dateStr: string) => {
    e.stopPropagation()
    const dayItems = planItems.filter(p => p.date === dateStr)
    if (dayItems.length === 0) return
    const c = await Swal.fire({
      title: 'Günü Temizle',
      text: `${dayItems.length} video planı silinecek.`,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Sil', cancelButtonText: 'Vazgeç',
      confirmButtonColor: '#ef4444',
    })
    if (c.isConfirmed && userId) {
      await supabase.from('video_plan_items').delete().in('id', dayItems.map(d => d.id))
      setPlanItems(p => p.filter(i => i.date !== dateStr))
    }
  }

  const handleSwapDays = useCallback(async (src: string, tgt: string) => {
    if (src === tgt || !userId) return
    const srcItems = planItems.filter(p => p.date === src)
    const tgtItems = planItems.filter(p => p.date === tgt)
    if (!srcItems.length && !tgtItems.length) return

    setLoading(true)
    const batch: any[] = []
    srcItems.forEach(i => batch.push({ id: i.id, user_id: userId, resource_id: i.resource_id, video_count: i.video_count, date: tgt }))
    tgtItems.forEach(i => batch.push({ id: i.id, user_id: userId, resource_id: i.resource_id, video_count: i.video_count, date: src }))

    const { error } = await supabase.from('video_plan_items').upsert(batch)
    if (!error) {
      setPlanItems(prev => {
        const rest = prev.filter(p => p.date !== src && p.date !== tgt)
        return [...rest, ...batch]
      })
      Swal.fire({ icon: 'success', title: 'Taşındı!', toast: true, position: 'top-end', showConfirmButton: false, timer: 1200 })
    }
    setLoading(false)
    setDragSourceDate(null)
    setDragOverDate(null)
  }, [planItems, userId])

  const handleShiftPlan = async (e: React.MouseEvent, dateStr: string) => {
    e.stopPropagation()
    const c = await Swal.fire({
      title: 'Planı Kaydır', text: 'Bu tarihten sonrasını 1 gün ileri kaydır.',
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Kaydır', cancelButtonText: 'Vazgeç',
      confirmButtonColor: '#2563eb',
    })
    if (!c.isConfirmed || !userId) return
    const items = planItems.filter(p => p.date >= dateStr)
    if (!items.length) { Swal.fire('Bilgi', 'Kaydırılacak plan yok.', 'info'); return }

    setLoading(true)
    const batch = items.map(i => {
      const d = new Date(i.date); d.setDate(d.getDate() + 1)
      return { id: i.id, user_id: userId, resource_id: i.resource_id, video_count: i.video_count, date: localDateStr(d) }
    })
    const { error } = await supabase.from('video_plan_items').upsert(batch)
    if (!error) {
      setPlanItems(prev => prev.map(p => {
        const u = batch.find(b => b.id === p.id)
        return u ? { ...p, date: u.date } : p
      }))
      Swal.fire({ icon: 'success', title: 'Kaydırıldı', toast: true, position: 'top-end', showConfirmButton: false, timer: 1200 })
    }
    setLoading(false)
  }


  const handleProgressClick = async (item: VideoPlanItem, res: Resource | undefined) => {
    if (!userId || !res) return
    const current = item.watched_count || 0
    
    const html = `
      <div class="flex flex-col gap-2 text-left mt-2">
        <label class="text-xs font-bold text-slate-500 uppercase">İzlenen Video Sayısı</label>
        <div class="flex items-center gap-2">
          <input type="number" id="watch-input" class="swal2-input !m-0 !w-full" value="${current}" min="0" max="${item.video_count}">
          <span class="text-sm font-bold text-slate-400 whitespace-nowrap">/ ${item.video_count}</span>
        </div>
      </div>
    `

    const c = await Swal.fire({
      title: 'İlerleme Kaydet',
      html,
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'Kaydet',
      denyButtonText: 'Tümünü İzledim',
      cancelButtonText: 'İptal',
      confirmButtonColor: '#2563eb',
      denyButtonColor: '#10b981',
      preConfirm: () => {
        const val = parseInt((document.getElementById('watch-input') as HTMLInputElement).value)
        return isNaN(val) ? 0 : val
      }
    })

    let newVal = current
    if (c.isConfirmed) newVal = c.value as number
    else if (c.isDenied) newVal = item.video_count
    else return

    newVal = Math.min(item.video_count, Math.max(0, newVal))

    setLoading(true)
    const { error } = await supabase.from('video_plan_items').update({
      watched_count: newVal,
      is_completed: newVal >= item.video_count
    }).eq('id', item.id)

    if (error) {
      if (error.code === 'PGRST204' || error.message.includes('column')) {
        Swal.fire({
          title: 'Veritabanı Güncellemesi Gerekli',
          html: `İzleme takibini kullanabilmek için veritabanına kolon eklenmeli.<br><br>
                 Supabase SQL Editor'e girip şunu çalıştırın:<br>
                 <pre style="text-align:left; background:#f1f5f9; padding:8px; border-radius:4px; font-size:11px; margin-top:10px; overflow-x:auto;">
ALTER TABLE video_plan_items 
ADD COLUMN watched_count INT DEFAULT 0,
ADD COLUMN is_completed BOOLEAN DEFAULT false;</pre>`,
          icon: 'warning'
        })
      } else {
        Swal.fire('Hata', error.message, 'error')
      }
    } else {
      setPlanItems(prev => prev.map(p => p.id === item.id ? { ...p, watched_count: newVal, is_completed: newVal >= item.video_count } : p))
    }
    setLoading(false)
  }


  const handleMarkDayWatched = async (e: React.MouseEvent, dateStr: string, dayItems: VideoPlanItem[]) => {
    e.stopPropagation()
    if (!userId || !dayItems.length) return
    const uncompleted = dayItems.filter(i => (i.watched_count || 0) < i.video_count)
    if (uncompleted.length === 0) {
      Swal.fire({ title: 'Zaten Tamamlanmış', text: 'Bu gündeki tüm videolar zaten izlendi.', icon: 'info', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 })
      return
    }

    setLoading(true)
    const batch = dayItems.map(i => ({
      id: i.id,
      user_id: userId,
      resource_id: i.resource_id,
      date: i.date,
      video_count: i.video_count,
      watched_count: i.video_count,
      is_completed: true
    }))

    const { error } = await supabase.from('video_plan_items').upsert(batch)
    if (error) {
      if (error.code === 'PGRST204' || error.message.includes('column')) {
        Swal.fire({
          title: 'Veritabanı Güncellemesi Gerekli',
          html: `İzleme takibini kullanabilmek için veritabanına kolon eklenmeli.<br><br>
                 Supabase SQL Editor'e girip şunu çalıştırın:<br>
                 <pre style="text-align:left; background:#f1f5f9; padding:8px; border-radius:4px; font-size:11px; margin-top:10px; overflow-x:auto;">
ALTER TABLE video_plan_items 
ADD COLUMN watched_count INT DEFAULT 0,
ADD COLUMN is_completed BOOLEAN DEFAULT false;</pre>`,
          icon: 'warning'
        })
      } else {
        Swal.fire('Hata', error.message, 'error')
      }
    } else {
      setPlanItems(prev => prev.map(p => {
        const u = batch.find(b => b.id === p.id)
        return u ? { ...p, watched_count: u.watched_count, is_completed: true } : p
      }))
      Swal.fire({ icon: 'success', title: 'Tümü işaretlendi', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 })
    }
    setLoading(false)
  }

  /* resource actions */
  const handleEditResource = (r: Resource) => {
    setEditingRes(r)
    setEditTotal(r.total_videos?.toString() || '0')
    setEditAvg(r.avg_video_duration?.toString() || '0')
  }

  const saveEditResource = async () => {
    if (!editingRes) return
    const t = parseInt(editTotal) || 0
    const a = parseInt(editAvg) || 0
    await supabase.from('resources').update({ total_videos: t, avg_video_duration: a }).eq('id', editingRes.id)
    setResources(p => p.map(r => r.id === editingRes.id ? { ...r, total_videos: t, avg_video_duration: a } : r))
    setAllResources(p => p.map(r => r.id === editingRes.id ? { ...r, total_videos: t, avg_video_duration: a } : r))
    setEditingRes(null)
  }

  const handleAddResourceToPlan = async () => {
    const other = allResources.filter(r => r.resource_type !== 'video_ders')
    if (!other.length) { Swal.fire('Bilgi', 'Eklenecek kaynak yok.', 'info'); return }
    const html = other.map(r => `<option value="${r.id}">${cleanName(r.subject_name || '')} — ${cleanName(r.name)}</option>`).join('')
    const { value: resId } = await Swal.fire({
      title: 'Kaynak Ekle',
      html: `<select id="rs" class="swal2-select" style="width:100%;font-size:14px;padding:8px"><option value="" disabled selected>Seçin…</option>${html}</select>`,
      focusConfirm: false, showCancelButton: true, confirmButtonText: 'Ekle', confirmButtonColor: '#2563eb',
      preConfirm: () => { const v = (document.getElementById('rs') as HTMLSelectElement).value; if (!v) Swal.showValidationMessage('Seçin.'); return v },
    })
    if (!resId) return

    const { value: det } = await Swal.fire({
      title: 'Video Bilgileri',
      html: `<input id="sw-t" class="swal2-input" placeholder="Toplam Video" type="number" min="1"><input id="sw-a" class="swal2-input" placeholder="Ort. Süre (dk)" type="number" min="1">`,
      focusConfirm: false, showCancelButton: true, confirmButtonText: 'Kaydet', confirmButtonColor: '#2563eb',
      preConfirm: () => ({ tot: parseInt((document.getElementById('sw-t') as HTMLInputElement).value) || 0, avg: parseInt((document.getElementById('sw-a') as HTMLInputElement).value) || 0 }),
    })
    const tot = det?.tot || 0, avg = det?.avg || 0
    await supabase.from('resources').update({ resource_type: 'video_ders', total_videos: tot, avg_video_duration: avg }).eq('id', resId)
    const found = allResources.find(r => r.id === resId)
    if (found) {
      const nr = { ...found, resource_type: 'video_ders', total_videos: tot, avg_video_duration: avg }
      setResources(p => [...p, nr])
      setAllResources(p => p.map(r => r.id === resId ? nr : r))
    }
  }

  const handleHideResource = async (res: Resource) => {
    const c = await Swal.fire({ title: 'Gizle', text: 'Kaynak listeden çıkacak.', icon: 'question', showCancelButton: true, confirmButtonText: 'Evet', cancelButtonText: 'İptal', confirmButtonColor: '#ef4444' })
    if (!c.isConfirmed) return
    await supabase.from('resources').update({ resource_type: 'diger' }).eq('id', res.id)
    setResources(p => p.filter(r => r.id !== res.id))
    setAllResources(p => p.map(r => r.id === res.id ? { ...r, resource_type: 'diger' } : r))
    if (selectedResId === res.id) setSelectedResId(null)
  }

  /* export */
  const exportImage = async () => {
    if (!calendarRef.current) return
    try {
      const el = calendarRef.current
      const origOv = el.style.overflow
      const origH = el.style.height
      const origMaxH = el.style.maxHeight
      
      el.style.overflow = 'visible'
      el.style.height = 'max-content'
      el.style.maxHeight = 'none'

      await new Promise(r => setTimeout(r, 200))
      const canvas = await html2canvas(el, { 
        scale: 2, 
        backgroundColor: '#ffffff', 
        useCORS: true,
        windowWidth: el.scrollWidth + 100,
        windowHeight: el.scrollHeight + 100
      })
      
      el.style.overflow = origOv
      el.style.height = origH
      el.style.maxHeight = origMaxH

      const link = document.createElement('a')
      link.download = 'video_plani.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e) {
      console.error(e)
      Swal.fire('Hata', 'Görsel oluşturulamadı.', 'error')
    }
  }

  const exportJSON = () => {
    const data = {
      tarih: new Date().toLocaleString('tr-TR'),
      planlar: planItems.map(p => {
        const r = resources.find(x => x.id === p.resource_id)
        return { tarih: p.date, ders: cleanName(r?.subject_name || ''), kaynak: cleanName(r?.name || ''), video: p.video_count, sure_dk: p.video_count * (r?.avg_video_duration || 0) }
      }),
    }
    const b = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'video_plani.json'; a.click(); URL.revokeObjectURL(u)
  }

  /* navigate */
  const goWeek = (dir: -1 | 1) => {
    setStartDate(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + dir * 7)
      return d
    })
  }

  /* ─── Derived ─── */
  const weeklyStats = (() => {
    const weeks: { start: Date; totalMin: number; totalVid: number }[] = []
    for (let w = 0; w < 5; w++) {
      const wStart = new Date(startDate); wStart.setDate(wStart.getDate() + w * 7)
      let tMin = 0; let tVid = 0
      for (let d = 0; d < 7; d++) {
        const dd = new Date(wStart); dd.setDate(dd.getDate() + d)
        const ds = localDateStr(dd)
        planItems.filter(p => p.date === ds).forEach(p => {
          const r = allResources.find(x => x.id === p.resource_id)
          tVid += p.video_count
          tMin += p.video_count * (r?.avg_video_duration || 0)
        })
      }
      weeks.push({ start: wStart, totalMin: tMin, totalVid: tVid })
    }
    return weeks
  })()

  /* ─── Loading ─── */
  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-slate-400">Yükleniyor…</span>
      </div>
    </div>
  )

  /* ─── Render ─── */
  return (
    <div className="flex flex-col h-full gap-4 pb-2">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between shrink-0 gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <PlayCircle className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Video Planı</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {selectedResId
                ? <span className="text-blue-600 font-semibold">Kaynak seçili — takvimde bir güne tıklayarak ekleyin</span>
                : 'Sol panelden kaynak seçin, ardından takvime ekleyin'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          
          <button onClick={exportImage} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-[.97]">
            <ImageIcon className="h-3.5 w-3.5" /> PNG
          </button>
          <button onClick={exportJSON} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-white text-xs font-medium hover:bg-slate-700 transition-all active:scale-[.97]">
            <Download className="h-3.5 w-3.5" /> JSON
          </button>
        </div>
      </div>

      {/* ═══ MAIN LAYOUT ═══ */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT PANEL: Resources ── */}
        <div className="w-full lg:w-72 xl:w-80 flex flex-col shrink-0 min-h-[260px] lg:min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-blue-100 flex items-center justify-center">
                <CalendarIcon className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <span className="text-[13px] font-bold text-slate-700">Kaynaklar</span>
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-semibold">{resources.length}</span>
            </div>
            <button onClick={handleAddResourceToPlan} className="h-7 w-7 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-all active:scale-90 shadow-sm">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {resources.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-10">
                <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                  <PlayCircle className="h-6 w-6 text-slate-300" />
                </div>
                <p className="text-xs text-slate-400 font-medium">Henüz kaynak eklenmemiş</p>
                <p className="text-[10px] text-slate-300 mt-1">Sağ üst "+" ile ekleyin</p>
              </div>
            ) : (
              resources.map(res => {
                const col = hashColor(res.subject_id)
                const isSelected = selectedResId === res.id
                const watched = planItems.filter(p => p.resource_id === res.id).reduce((s, p) => s + (p.watched_count || 0), 0)
                const total = res.total_videos || 0
                const remaining = Math.max(0, total - watched)
                const remainingMin = remaining * (res.avg_video_duration || 0)
                const pct = total > 0 ? Math.min(100, Math.round((watched / total) * 100)) : 0

                return (
                  <motion.div
                    key={res.id}
                    layout
                    onClick={() => setSelectedResId(isSelected ? null : res.id)}
                    className={`rounded-xl p-3 cursor-pointer transition-all duration-200 border-2 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 shadow-md shadow-blue-500/10'
                        : 'border-transparent hover:border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: col.bg }}>
                          <PlayCircle className="h-4 w-4" style={{ color: col.dot }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: col.text }}>
                            {cleanName(res.subject_name || '')}
                          </span>
                          <h3 className="text-[13px] font-bold text-slate-800 truncate leading-tight mt-0.5">
                            {cleanName(res.name)}
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={e => { e.stopPropagation(); handleEditResource(res) }} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                          <Settings className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); handleHideResource(res) }} className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                          <EyeOff className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {editingRes?.id === res.id ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 p-2.5 bg-white rounded-lg border border-slate-200 space-y-2" onClick={e => e.stopPropagation()}>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Toplam Video</label>
                                <input type="number" min="0" value={editTotal} onChange={e => setEditTotal(e.target.value)}
                                  className="w-full h-7 text-[11px] px-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                              </div>
                              <div>
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Ort. Dk/Vid</label>
                                <input type="number" min="0" value={editAvg} onChange={e => setEditAvg(e.target.value)}
                                  className="w-full h-7 text-[11px] px-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                              </div>
                            </div>
                            <div className="flex gap-1.5 justify-end pt-1">
                              <button onClick={() => setEditingRes(null)} className="h-6 px-2.5 text-[10px] bg-slate-100 text-slate-600 rounded-md font-medium hover:bg-slate-200 transition-all">İptal</button>
                              <button onClick={saveEditResource} className="h-6 px-2.5 text-[10px] bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-all">Kaydet</button>
                            </div>
                          </div>
                        </motion.div>
                      ) : (
                        <div className="mt-2.5">
                          <div className="flex items-center justify-between text-[10px] mb-1.5">
                            <span className="text-slate-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {res.avg_video_duration || 0} dk/vid
                            </span>
                            <span className="font-bold text-right leading-tight" style={{ color: remaining === 0 ? '#059669' : col.text }}>
                              {remaining === 0 ? '✓ Tamamlandı' : (
                                <>Kalan: {remaining} Vid<br/><span className="opacity-70 text-[9px]">({fmtMinutes(remainingMin)})</span></>
                              )}
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden" title={`${watched} / ${total} izlendi`}>
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#059669' : col.accent }} />
                          </div>
                        </div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })
            )}
          </div>
        </div>

        {/* ── RIGHT: Calendar ── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {/* Nav */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={() => goWeek(-1)} className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all active:scale-90">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-center min-w-[160px]">
                <p className="text-[13px] font-bold text-slate-800">
                  {startDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} — {days[34].toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button onClick={() => goWeek(1)} className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all active:scale-90">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Weekly summary pills */}
            <div className="hidden xl:flex items-center gap-1.5">
              {weeklyStats.map((w, i) => (
                <div key={i} className={`text-[10px] px-2 py-1 rounded-md font-medium ${w.totalVid > 0 ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-400'}`}>
                  H{i + 1}: {w.totalVid > 0 ? `${w.totalVid} vid · ${fmtMinutes(w.totalMin)}` : '—'}
                </div>
              ))}
            </div>
          </div>

          {/* Calendar grid */}
          <div className="flex-1 overflow-auto p-3" ref={calendarRef}>
            <div className="min-w-[700px] h-full flex flex-col gap-1.5">
              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1.5 shrink-0">
                {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest py-1">{d}</div>
                ))}
              </div>

              {/* 5 rows × 7 cols */}
              {[0, 1, 2, 3, 4].map(week => (
                <div key={week} className="grid grid-cols-7 gap-1.5 mb-1.5">
                  {days.slice(week * 7, week * 7 + 7).map(d => {
                    const ds = localDateStr(d)
                    const dItems = planItems.filter(p => p.date === ds)
                    const isToday = ds === localDateStr(new Date())
                    const isDragSrc = dragSourceDate === ds
                    const isDragOver = dragOverDate === ds && dragSourceDate !== ds

                    let totalMin = 0
                    let totalVid = 0
                    dItems.forEach(p => {
                      totalVid += p.video_count
                      const r = allResources.find(x => x.id === p.resource_id)
                      totalMin += p.video_count * (r?.avg_video_duration || 0)
                    })

                    return (
                      <div
                        key={ds}
                        onClick={() => handleDayClick(d)}
                        draggable={dItems.length > 0}
                        onDragStart={e => { e.dataTransfer.setData('text/plain', ds); setDragSourceDate(ds) }}
                        onDragEnd={() => { setDragSourceDate(null); setDragOverDate(null) }}
                        onDragOver={e => { e.preventDefault(); if (dragOverDate !== ds) setDragOverDate(ds) }}
                        onDragLeave={() => { if (dragOverDate === ds) setDragOverDate(null) }}
                        onDrop={e => { e.preventDefault(); const src = e.dataTransfer.getData('text/plain'); if (src) handleSwapDays(src, ds) }}
                        className={`
                          rounded-xl p-2 flex flex-col transition-all duration-200 cursor-pointer relative group
                          ${isToday ? 'ring-2 ring-blue-500 bg-blue-50/30' : ''}
                          ${isDragSrc ? 'opacity-40 scale-[.97] ring-2 ring-blue-300' : ''}
                          ${isDragOver ? 'ring-2 ring-blue-500 bg-blue-50 scale-[1.02] shadow-lg' : ''}
                          ${!isToday && !isDragSrc && !isDragOver ? 'border border-slate-100 bg-slate-50/30 hover:bg-white hover:border-slate-200 hover:shadow-sm' : ''}
                          ${isToday && !isDragOver ? 'border border-blue-200' : ''}
                        `}
                      >
                        {/* Day header */}
                        <div className="flex flex-col mb-1.5 border-b border-slate-100 pb-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              {dItems.length > 0 && (
                                <GripVertical className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                              )}
                              <span className={`text-[11px] font-bold leading-none ${isToday ? 'bg-blue-600 text-white rounded-md px-1.5 py-0.5' : 'text-slate-600'}`}>
                                {d.getDate()}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              {dItems.length > 0 && (
                                <button onClick={e => handleClearDay(e, ds)} title="Günü temizle"
                                  className="p-0.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                              <button onClick={e => handleShiftPlan(e, ds)} title="Sonrasını 1 gün ertele"
                                className="p-0.5 rounded text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-all">
                                <SkipForward className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          {totalVid > 0 && (
                            <div className="mt-1 flex items-center justify-between text-[9px]">
                              <span className="font-bold text-slate-400">Toplam: {totalVid} Vid</span>
                              <span className="font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">{fmtMinutes(totalMin)}</span>
                            </div>
                          )}
                        </div>

                        {/* Items - NOT scrollable anymore, they just list down */}
                        <div className="flex flex-col gap-1.5 flex-1">
                          {dItems.map(item => {
                            const r = resources.find(x => x.id === item.resource_id)
                            const col = r ? hashColor(r.subject_id) : PALETTE[0]
                            return (
                              <div
                                key={item.id}
                                className="rounded-lg px-2 py-1.5 group/item relative transition-all hover:shadow-sm"
                                style={{ backgroundColor: col.card }}
                              >
                                
                                <div className="flex items-start justify-between gap-1">
                                  <div className="min-w-0">
                                    <p className="text-[9px] font-bold truncate leading-tight" style={{ color: col.text }}>
                                      {cleanName(r?.subject_name || '')}
                                    </p>
                                    <p className="text-[10px] font-extrabold truncate leading-tight mt-0.5" style={{ color: col.dot }}>
                                      {cleanName(r?.name || '?')} · {item.video_count} Vid
                                    </p>
                                  </div>
                                  <button
                                    onClick={e => { e.stopPropagation(); handleProgressClick(item, r) }}
                                    className={`h-5 w-5 rounded flex items-center justify-center shrink-0 transition-all ${
                                      (item.watched_count || 0) >= item.video_count 
                                        ? 'bg-emerald-500 text-white' 
                                        : 'bg-white/60 text-slate-400 hover:bg-emerald-100 hover:text-emerald-600'
                                    }`}
                                    title={`İzlenen: ${item.watched_count || 0} / ${item.video_count}`}
                                  >
                                    <Check className="h-3 w-3" />
                                  </button>
                                </div>
                                {(item.watched_count || 0) > 0 && (
                                  <div className="w-full bg-black/5 rounded-full h-1 mt-1.5 overflow-hidden">
                                    <div 
                                      className="h-full bg-emerald-500 transition-all" 
                                      style={{ width: `${Math.min(100, ((item.watched_count || 0) / item.video_count) * 100)}%` }} 
                                    />
                                  </div>
                                )}
                                <button
                                  onClick={e => handleDeleteItem(e, item.id)}
                                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-all shadow-sm hover:bg-red-600 active:scale-90"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            )
                          })}
                          
                          {dItems.length > 0 && dItems.some(i => (i.watched_count || 0) < i.video_count) && (
                            <button
                              onClick={(e) => handleMarkDayWatched(e, ds, dItems)}
                              className="mt-1 w-full py-1.5 rounded-lg border border-emerald-100 bg-emerald-50/50 hover:bg-emerald-100/50 text-emerald-600 text-[9px] font-bold flex items-center justify-center gap-1 transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Check className="h-3 w-3" /> Tümünü İzledim
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      
    </div>
  )
}
