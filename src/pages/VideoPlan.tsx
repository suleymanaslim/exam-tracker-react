import './SuitePages.css'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Download, Printer, Settings, EyeOff, SkipForward, X, Check, ChevronUp, ChevronDown } from 'lucide-react'
import Swal from 'sweetalert2'
import { useAdminStore } from '../lib/adminStore'
import { playlistURL } from '../lib/playlist'
import { videoPlanPrintHTML } from '../lib/videoPlanPrint'

/* ─────────────── Types ─────────────── */
function showPlanError(error: { code?: string; message: string }) {
  return Swal.fire({
    icon: 'error',
    title: 'Plan kaydedilemedi',
    text: error.code === '42501'
      ? 'Bu kullanıcının video planını düzenleme izni yok. Admin video planı izinlerinin Supabase üzerinde uygulanması gerekiyor.'
      : error.message,
    confirmButtonText: 'Tamam',
  })
}

interface Resource {
  id: string; subject_id: string; name: string; resource_type: string
  total_videos: number; avg_video_duration: number; subject_name?: string; url?: string | null
}
interface VideoPlanItem {
  id: string; resource_id: string; date: string; video_count: number;
  watched_count?: number; is_completed?: boolean; sort_order?: number;
}

/* ─────────────── Color Palette ─────────────── */
const PALETTE = [
  { bg: '#dbeafe', card: '#eff6ff', text: '#1e40af', accent: '#3b82f6', dot: '#2563eb', border: '#bfdbfe' },
  { bg: '#d1fae5', card: '#ecfdf5', text: '#065f46', accent: '#10b981', dot: '#059669', border: '#a7f3d0' },
  { bg: '#fef3c7', card: '#fffbeb', text: '#92400e', accent: '#f59e0b', dot: '#d97706', border: '#fde68a' },
  { bg: '#ede9fe', card: '#faf5ff', text: '#5b21b6', accent: '#8b5cf6', dot: '#7c3aed', border: '#ddd6fe' },
  { bg: '#ffe4e6', card: '#fff1f2', text: '#9f1239', accent: '#f43f5e', dot: '#e11d48', border: '#fecdd3' },
  { bg: '#e0e7ff', card: '#eef2ff', text: '#3730a3', accent: '#6366f1', dot: '#4f46e5', border: '#c7d2fe' },
  { bg: '#ccfbf1', card: '#f0fdfa', text: '#115e59', accent: '#14b8a6', dot: '#0d9488', border: '#99f6e4' },
  { bg: '#fce7f3', card: '#fdf2f8', text: '#9d174d', accent: '#ec4899', dot: '#db2777', border: '#fbcfe8' },
]

function hashColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h)
  return PALETTE[Math.abs(h) % PALETTE.length]
}

function cleanName(n?: string | null) {
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


  /* editing */
  const [editingRes, setEditingRes] = useState<Resource | null>(null)
  const [editTotal, setEditTotal] = useState('')
  const [editAvg, setEditAvg] = useState('')
  const [editPlaylistURL, setEditPlaylistURL] = useState('')
  const [savingResource, setSavingResource] = useState(false)

  /* selection */
  const [selectedResId, setSelectedResId] = useState<string | null>(null)

  /* drag */
  const [dragSourceDate, setDragSourceDate] = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  /* calendar start */
  const [startDate, setStartDate] = useState(getMonday(new Date()))

  const days = Array.from({ length: 7 }).map((_, i) => {
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

    const { value: count } = await Swal.fire({
      title: `${cleanName(res.name)}`,
      text: `${dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} — kaç video?`,
      html: `
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:16px 0">
          ${[1,2,3,4,5,6].map(n => `<button className="swal-quick-btn" data-val="${n}" style="width:52px;height:44px;border-radius:10px;border:2px solid #e2e8f0;background:#f8fafc;font-size:16px;font-weight:700;color:#334155;cursor:pointer;transition:all .15s">${n}</button>`).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:8px;justify-content:center;margin-top:8px">
          <input id="manual-count" type="number" min="1" placeholder="veya elle yaz..." style="width:120px;text-align:center;padding:6px 12px;border:2px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:600;outline:none">
          <button id="manual-add-btn" style="padding:6px 16px;border-radius:8px;background:#2563eb;color:white;font-size:13px;font-weight:700;border:none;cursor:pointer">Ekle</button>
        </div>
      `,
      showCancelButton: true,
      showConfirmButton: false,
      cancelButtonText: 'Vazgeç',
      didOpen: () => {
        const btns = Swal.getPopup()?.querySelectorAll('.swal-quick-btn')
        btns?.forEach(btn => {
          btn.addEventListener('click', () => {
            const val = parseInt((btn as HTMLElement).dataset.val || '0')
            if (val > 0) Swal.close({ isConfirmed: true, isDenied: false, isDismissed: false, value: val })
          })
          btn.addEventListener('mouseover', () => { (btn as HTMLElement).style.background = '#eff6ff'; (btn as HTMLElement).style.borderColor = '#93c5fd' })
          btn.addEventListener('mouseout', () => { (btn as HTMLElement).style.background = '#f8fafc'; (btn as HTMLElement).style.borderColor = '#e2e8f0' })
        })
        const manualBtn = Swal.getPopup()?.querySelector('#manual-add-btn')
        manualBtn?.addEventListener('click', () => {
          const v = parseInt((Swal.getPopup()?.querySelector('#manual-count') as HTMLInputElement).value)
          if (v > 0) Swal.close({ isConfirmed: true, isDenied: false, isDismissed: false, value: v })
        })
      },
    })
    if (count && count > 0) {
      const maxOrder = planItems.filter(p => p.date === dateStr).reduce((m, p) => Math.max(m, p.sort_order || 0), 0)
      const { data, error } = await supabase.from('video_plan_items').insert({
        user_id: userId, resource_id: selectedResId,
        date: dateStr, video_count: count, sort_order: maxOrder + 1,
      }).select().single()
      if (error) { await showPlanError(error); return }
      if (data) setPlanItems(p => [...p, data])
    }
  }

  const handleDeleteItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const { error } = await supabase.from('video_plan_items').delete().eq('id', id)
    if (error) { await showPlanError(error); return }
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
      const { error } = await supabase.from('video_plan_items').delete().in('id', dayItems.map(d => d.id))
      if (error) { await showPlanError(error); return }
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
    if (error) await showPlanError(error)
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
    if (error) await showPlanError(error)
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
      <div className="flex flex-col gap-2 text-left mt-2">
        <label className="text-xs font-semibold text-slate-500 uppercase">İzlenen Video Sayısı</label>
        <div className="flex items-center gap-2">
          <input type="number" id="watch-input" className="swal2-input !m-0 !w-full" value="${current}" min="0" max="${item.video_count}">
          <span className="text-sm font-semibold text-slate-400 whitespace-nowrap">/ ${item.video_count}</span>
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


  const handleMarkDayWatched = async (e: React.MouseEvent, dayItems: VideoPlanItem[]) => {
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
    setEditPlaylistURL(r.url || '')
  }

  const saveEditResource = async () => {
    if (!editingRes || savingResource) return
    const url = playlistURL(editPlaylistURL)
    if (editPlaylistURL.trim() && !url) {
      void Swal.fire('Geçersiz bağlantı', 'https:// veya http:// ile başlayan geçerli bir oynatma listesi bağlantısı girin.', 'warning')
      return
    }
    const values = { total_videos: parseInt(editTotal) || 0, avg_video_duration: parseInt(editAvg) || 0, url }
    setSavingResource(true)
    const { error } = await supabase.from('resources').update(values).eq('id', editingRes.id)
    setSavingResource(false)
    if (error) { void showPlanError(error); return }
    setResources(previous => previous.map(resource => resource.id === editingRes.id ? { ...resource, ...values } : resource))
    setAllResources(previous => previous.map(resource => resource.id === editingRes.id ? { ...resource, ...values } : resource))
    setEditingRes(null)
  }

  const handleAddResourceToPlan = async () => {
    const other = allResources.filter(r => r.resource_type !== 'video_ders')
    if (!other.length) { Swal.fire('Bilgi', 'Eklenecek kaynak yok.', 'info'); return }
    const html = other.map(r => `<option value="${r.id}">${cleanName(r.subject_name || '')} — ${cleanName(r.name)}</option>`).join('')
    const { value: resId } = await Swal.fire({
      title: 'Kaynak Ekle',
      html: `<select id="rs" className="swal2-select" style="width:100%;font-size:14px;padding:8px"><option value="" disabled selected>Seçin…</option>${html}</select>`,
      focusConfirm: false, showCancelButton: true, confirmButtonText: 'Ekle', confirmButtonColor: '#2563eb',
      preConfirm: () => { const v = (document.getElementById('rs') as HTMLSelectElement).value; if (!v) Swal.showValidationMessage('Seçin.'); return v },
    })
    if (!resId) return

    const { value: det } = await Swal.fire({
      title: 'Video Bilgileri',
      html: `<input id="sw-t" className="swal2-input" placeholder="Toplam Video" type="number" min="1"><input id="sw-a" className="swal2-input" placeholder="Ort. Süre (dk)" type="number" min="1"><input id="sw-url" className="swal2-input" placeholder="Oynatma listesi URL (isteğe bağlı)" type="url">`,
      focusConfirm: false, showCancelButton: true, confirmButtonText: 'Kaydet', confirmButtonColor: '#2563eb',
      preConfirm: () => {
        const entered = (document.getElementById('sw-url') as HTMLInputElement).value
        const url = playlistURL(entered)
        if (entered.trim() && !url) { Swal.showValidationMessage('Geçerli bir http:// veya https:// bağlantısı girin.'); return false }
        return { tot: parseInt((document.getElementById('sw-t') as HTMLInputElement).value) || 0, avg: parseInt((document.getElementById('sw-a') as HTMLInputElement).value) || 0, url }
      },
    })
    if (!det) return
    const tot = det.tot, avg = det.avg
    const { error } = await supabase.from('resources').update({ resource_type: 'video_ders', total_videos: tot, avg_video_duration: avg, url: det.url }).eq('id', resId)
    if (error) { void showPlanError(error); return }
    const found = allResources.find(r => r.id === resId)
    if (found) {
      const nr = { ...found, resource_type: 'video_ders', total_videos: tot, avg_video_duration: avg, url: det.url }
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

  /* reorder items within a day */
  const handleReorderItem = async (e: React.MouseEvent, item: VideoPlanItem, dir: -1 | 1) => {
    e.stopPropagation()
    const dayItems = planItems
      .filter(p => p.date === item.date)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    const idx = dayItems.findIndex(i => i.id === item.id)
    const targetIdx = idx + dir
    if (targetIdx < 0 || targetIdx >= dayItems.length) return

    const other = dayItems[targetIdx]
    const myOrder = item.sort_order || idx
    const otherOrder = other.sort_order || targetIdx

    setLoading(true)
    const { error } = await supabase.from('video_plan_items').upsert([
      { id: item.id, user_id: userId!, resource_id: item.resource_id, date: item.date, video_count: item.video_count, sort_order: otherOrder },
      { id: other.id, user_id: userId!, resource_id: other.resource_id, date: other.date, video_count: other.video_count, sort_order: myOrder },
    ])
    if (error) { setLoading(false); await showPlanError(error); return }
    setPlanItems(prev => prev.map(p => {
      if (p.id === item.id) return { ...p, sort_order: otherOrder }
      if (p.id === other.id) return { ...p, sort_order: myOrder }
      return p
    }))
    setLoading(false)
  }
  /* ─── Render ─── */
  const exportJSON = () => {
    const strs = days.map(localDateStr);
    const data = {
      hafta: { baslangic: strs[0], bitis: strs[6] },
      ozet: { toplam_video: 0, toplam_dk: 0, izlenen_video: 0 },
      gunler: strs.map(ds => {
        const dItems = planItems.filter(p => p.date === ds).sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
        let gVid = 0, gMin = 0, gWatched = 0;
        const plans = dItems.map(p => {
          const r = allResources.find(x => x.id === p.resource_id);
          const min = p.video_count * (r?.avg_video_duration || 0);
          gVid += p.video_count; gMin += min; gWatched += (p.watched_count || 0);
          return { ders: cleanName(r?.subject_name || ''), kaynak: cleanName(r?.name || ''), video: p.video_count, izlenen: p.watched_count||0, tamamlandi: !!p.is_completed, sure_dk: min };
        });
        data.ozet.toplam_video += gVid; data.ozet.toplam_dk += gMin; data.ozet.izlenen_video += gWatched;
        return { tarih: ds, planlar: plans };
      }),
    };
    const b = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'video_plani.json'; a.click(); URL.revokeObjectURL(u);
  }

  const printPlan = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      void Swal.fire('Sayfa açılamadı', 'Yazdırma görünümünü açmak için bu siteye açılır pencere izni verin.', 'info')
      return
    }
    const printDays = days.map(day => ({
      date: localDateStr(day),
      items: planItems.filter(item => item.date === localDateStr(day))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map(item => {
          const resource = allResources.find(resource => resource.id === item.resource_id)
          return {
            subject: cleanName(resource?.subject_name),
            resource: cleanName(resource?.name),
            videos: item.video_count,
            watched: item.watched_count || 0,
            minutes: item.video_count * (resource?.avg_video_duration || 0),
          }
        }),
    }))
    printWindow.document.open()
    printWindow.document.write(videoPlanPrintHTML(printDays))
    printWindow.document.close()
    printWindow.document.getElementById('print-plan')?.addEventListener('click', () => {
      printWindow.focus()
      printWindow.print()
    })
    printWindow.opener = null
  }

  const DOW = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz']

  let tMinAll = 0, tVidAll = 0, tWatchedAll = 0
  days.forEach(d => {
    const ds = localDateStr(d)
    planItems.filter(p => p.date === ds).forEach(p => {
      const r = allResources.find(x => x.id === p.resource_id)
      tVidAll += p.video_count; tWatchedAll += p.watched_count || 0;
      tMinAll += p.video_count * (r?.avg_video_duration || 0)
    })
  })

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-slate-400">Yükleniyor…</span>
      </div>
    </div>
  )

  return (
    <div className="suite-page suite-videoplan h-full flex flex-col gap-3 p-3 max-w-[1500px] mx-auto bg-slate-100 text-slate-900 overflow-hidden">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <p className="suite-eyebrow">VİDEO PROGRAMIN</p>
          <h1 className="text-lg font-semibold tracking-tight">Video planı</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {selectedResId ? <span className="text-slate-700 font-medium">Ders seçili — takvimde bir güne tıklayıp video sayısını girin</span> : 'Soldan ders seçin, güne tıklayın. Gün kartını sürükleyerek takas edin.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setStartDate(getMonday(new Date()))} className="h-7 px-3 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-500 hover:text-slate-900 hover:border-slate-400 transition-colors">Bugün</button>
          <div className="flex items-center">
            <button onClick={() => { const d = new Date(startDate); d.setDate(d.getDate() - 7); setStartDate(d) }} className="h-7 w-7 rounded-l-md border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors">‹</button>
            <button onClick={() => { const d = new Date(startDate); d.setDate(d.getDate() + 7); setStartDate(d) }} className="h-7 w-7 rounded-r-md border border-l-0 border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors">›</button>
          </div>
          <span className="text-xs font-semibold text-slate-700 tabular-nums">
            {days[0].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – {days[6].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <div className="w-px h-5 bg-slate-200 mx-1"></div>
          <button onClick={printPlan} className="h-7 px-2.5 rounded-md border border-slate-900 bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 transition-colors inline-flex items-center gap-1.5">
            <Printer className="h-3.5 w-3.5" /> Yazdır / PDF
          </button>
          <button onClick={exportJSON} className="h-7 px-3 rounded-md border border-slate-200 bg-white text-slate-500 text-xs font-medium hover:text-slate-900 transition-colors inline-flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" /> Veri (JSON)
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0">

        {/* LEFT: Dersler */}
        <div className="w-full lg:w-64 flex flex-col shrink-0 lg:min-h-0 max-h-[240px] lg:max-h-none overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between shrink-0">
            <span className="text-[14px] font-semibold flex items-center gap-2">Dersler
              <span className="text-[11px] text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5 font-semibold tabular-nums">{resources.length}</span>
            </span>
            <button onClick={handleAddResourceToPlan} className="h-6 px-2 rounded-md bg-slate-900 text-white flex items-center gap-1 text-[12px] font-medium hover:bg-slate-700 transition-colors">
              <Plus className="h-3 w-3" /> Ekle
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {resources.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
                <p className="text-xs">Henüz kaynak yok</p>
                <p className="text-[11px] text-slate-300">Üstteki Ekle ile kaynak ekleyin</p>
              </div>
            ) : (
              resources.map(res => {
                const c = hashColor(res.subject_id)
                const items = planItems.filter(p => p.resource_id === res.id)
                const watched = items.reduce((s, p) => s + (p.watched_count || 0), 0)
                const total = res.total_videos || 0
                const remaining = Math.max(0, total - watched)
                const done = total > 0 && remaining === 0
                const pct = total > 0 ? Math.min(100, Math.round((watched / total) * 100)) : 0
                const sel = selectedResId === res.id

                return (
                  <div key={res.id} onClick={() => setSelectedResId(sel ? null : res.id)} 
                    className={`group px-3 py-2.5 border-b border-slate-100 last:border-b-0 cursor-pointer transition-colors ${sel ? 'bg-slate-900/5 shadow-[inset_2px_0_0_0_#0f172a]' : 'hover:bg-slate-50'}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }}></span>
                      <span className="text-[14px] font-medium truncate flex-1">{cleanName(res.name)}</span>
                      <span className="flex items-center gap-0.5 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); handleEditResource(res) }} title="Düzenle" className="p-1 rounded text-slate-300 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                          <Settings className="h-3 w-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); handleHideResource(res) }} title="Gizle" className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <EyeOff className="h-3 w-3" />
                        </button>
                      </span>
                    </div>
                    {editingRes?.id === res.id ? (
                      <div className="mt-2 p-2 bg-white rounded border border-slate-200 ml-4" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-2 mb-2">
                          <input type="number" min="0" value={editTotal} onChange={e => setEditTotal(e.target.value)} placeholder="Top. vid" className="w-full h-7 px-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-900 tabular-nums" />
                          <input type="number" min="0" value={editAvg} onChange={e => setEditAvg(e.target.value)} placeholder="Dk/vid" className="w-full h-7 px-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-900 tabular-nums" />
                        </div>
                        <label className="block text-[12px] text-slate-600 mb-2">Oynatma listesi bağlantısı<input type="url" value={editPlaylistURL} onChange={event => setEditPlaylistURL(event.target.value)} placeholder="https://www.youtube.com/playlist?list=…" className="mt-1 w-full h-8 px-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-900" /></label>
                        <div className="flex gap-1">
                          <button disabled={savingResource} onClick={() => setEditingRes(null)} className="flex-1 h-6 rounded border border-slate-200 text-[11px] font-medium text-slate-500 hover:bg-slate-50">İptal</button>
                          <button disabled={savingResource} onClick={saveEditResource} className="flex-1 h-6 rounded bg-slate-900 text-white text-[11px] font-medium hover:bg-slate-700">{savingResource ? 'Kaydediliyor…' : 'Kaydet'}</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-[12px] text-slate-400 mt-1.5 ml-4">
                          <span><span className="text-slate-600 font-medium tabular-nums">{watched}</span>/{total} video</span>
                          {done ? <span className="text-emerald-600 font-medium">tamamlandı</span> : <span>kalan <span className="text-slate-600 font-medium tabular-nums">{remaining}</span> · {fmtMinutes(remaining * (res.avg_video_duration || 0))}</span>}
                        </div>
                        <div className="h-[3px] rounded-full bg-slate-100 overflow-hidden mt-1.5 ml-4">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: done ? '#059669' : c.dot }}></div>
                        </div>
                      </>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* RIGHT: Week */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex-1 flex flex-col min-h-0 overflow-auto bg-white">
            {/* Headers */}
            <div className="grid grid-cols-7 border-b border-slate-200 sticky top-0 bg-white z-10 shrink-0">
              {days.map(d => {
                const ds = localDateStr(d)
                const isT = ds === localDateStr(new Date())
                let tMin = 0, tVid = 0
                planItems.filter(p => p.date === ds).forEach(p => {
                  const r = allResources.find(x => x.id === p.resource_id)
                  tVid += p.video_count; tMin += p.video_count * (r?.avg_video_duration || 0)
                })
                return (
                  <div key={ds} className={`px-1.5 py-2 text-center border-r border-slate-100 last:border-r-0 ${isT ? 'bg-slate-50' : ''}`} style={isT ? { boxShadow: 'inset 0 -2px 0 0 #0f172a' } : {}}>
                    <div className={`text-[11px] font-semibold uppercase ${isT ? 'text-slate-900' : 'text-slate-400'}`}>{DOW[(d.getDay() + 6) % 7]}</div>
                    <div className={`text-sm font-semibold tabular-nums leading-tight ${isT ? 'text-slate-900' : 'text-slate-700'}`}>{d.getDate()}</div>
                    <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">{tVid > 0 ? `${tVid}v · ${fmtMinutes(tMin)}` : '—'}</div>
                  </div>
                )
              })}
            </div>
            {/* Grid */}
            <div className="grid grid-cols-7 flex-1">
              {days.map(d => {
                const ds = localDateStr(d)
                const isT = ds === localDateStr(new Date())
                const items = planItems.filter(p => p.date === ds).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                const hasUnwatched = items.some(i => (i.watched_count || 0) < i.video_count)

                return (
                  <div key={ds} 
                    className={`group/day relative p-1.5 border-r border-slate-100 last:border-r-0 cursor-pointer transition-colors min-h-[220px] ${isT ? 'bg-slate-50/60' : 'hover:bg-slate-50/80'} ${dragOverDate === ds ? 'shadow-[inset_0_0_0_2px_#0f172a] bg-slate-900/5' : ''} ${dragSourceDate === ds ? 'opacity-30' : ''}`}
                    onClick={() => handleDayClick(d)}
                    draggable={items.length > 0}
                    onDragStart={e => { e.dataTransfer.setData('text/plain', ds); e.dataTransfer.effectAllowed = 'move'; setDragSourceDate(ds) }}
                    onDragEnd={() => { setDragSourceDate(null); setDragOverDate(null) }}
                    onDragOver={e => { e.preventDefault(); if (dragSourceDate && dragSourceDate !== ds) setDragOverDate(ds) }}
                    onDragLeave={() => setDragOverDate(null)}
                    onDrop={e => { e.preventDefault(); setDragOverDate(null); const src = e.dataTransfer.getData('text/plain'); if (src) handleSwapDays(src, ds) }}
                  >
                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover/day:opacity-100 transition-opacity z-10">
                      <button onClick={e => handleShiftPlan(e, ds)} title="Bundan sonrasını 1 gün kaydır" className="h-5 w-5 rounded flex items-center justify-center text-slate-300 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 transition-colors bg-white/70">
                        <SkipForward className="h-2.5 w-2.5" />
                      </button>
                      {items.length > 0 && (
                        <button onClick={e => handleClearDay(e, ds)} title="Günü temizle" className="h-5 w-5 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors bg-white/70">
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 mt-3">
                      {items.map((it, idx) => {
                        const r = allResources.find(x => x.id === it.resource_id)
                        const c = r ? hashColor(r.subject_id) : PALETTE[7]
                        const w = it.watched_count || 0
                        const done = w >= it.video_count
                        const partial = w > 0 && !done
                        const itemMin = it.video_count * ((r && r.avg_video_duration) || 0)
                        
                        return (
                          <div key={it.id} onClick={e => e.stopPropagation()} className={`group/item relative rounded-lg border px-1.5 py-1 transition-colors ${done ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                            <div className="flex items-center gap-1">
                              <div className="flex opacity-50 group-hover/item:opacity-100 transition-opacity gap-[1px]">
                                {idx > 0 && <button onClick={e => handleReorderItem(e, it, -1)} className="hover:text-slate-900"><ChevronUp className="h-3 w-3" /></button>}
                                {idx < items.length - 1 && <button onClick={e => handleReorderItem(e, it, 1)} className="hover:text-slate-900"><ChevronDown className="h-3 w-3" /></button>}
                              </div>
                              <span className="text-[11px] font-semibold px-1.5 py-px rounded-full truncate" style={{ background: c.card, color: c.text }}>{cleanName(r?.subject_name || '')}</span>
                              <button onClick={e => { e.stopPropagation(); handleProgressClick(it, r) }} title={done ? 'Tamamlandı' : `${w}/${it.video_count} izlendi — güncellemek için tıkla`}
                                className={`ml-auto h-[18px] w-[18px] rounded-[5px] shrink-0 flex items-center justify-center transition-colors ${done ? 'bg-emerald-500 text-white' : 'border border-slate-200 text-slate-300 hover:border-emerald-400 hover:text-emerald-400'}`}>
                                <Check className="h-2.5 w-2.5" strokeWidth={3} />
                              </button>
                            </div>
                            <div className={`text-[12px] font-medium truncate mt-1 ${done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{cleanName(r?.name || '?')} · {it.video_count}v</div>
                            <div className="text-[11px] text-slate-400 tabular-nums">{fmtMinutes(itemMin)}{done ? ' · izlendi' : partial ? ` · ${w}/${it.video_count}` : ''}</div>
                            {partial && (
                              <div className="h-[2px] rounded-full bg-slate-100 mt-1 overflow-hidden">
                                <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(w / it.video_count) * 100}%` }}></div>
                              </div>
                            )}
                            <button onClick={e => handleDeleteItem(e, it.id)} className="absolute -top-1.5 right-0 h-3.5 w-3.5 rounded-full bg-slate-900 text-white items-center justify-center hover:bg-red-500 transition-colors hidden group-hover/item:flex">
                              <X className="h-2 w-2" strokeWidth={3} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    {items.length > 0 && hasUnwatched && (
                      <button onClick={e => handleMarkDayWatched(e, items)} className="mt-1 w-full py-1 rounded-md text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 opacity-0 group-hover/day:opacity-100 transition-all flex items-center justify-center gap-1">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} /> Tümünü izlendi say
                      </button>
                    )}
                    {items.length === 0 && (
                      <div className="h-full min-h-[60px] flex items-center justify-center opacity-0 group-hover/day:opacity-100 transition-opacity">
                        <span className="h-5 w-5 rounded border border-dashed border-slate-300 flex items-center justify-center text-slate-300">
                          <Plus className="h-3 w-3" strokeWidth={2.5} />
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="px-3 py-2 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0 text-xs text-slate-500">
            <span>Haftalık toplam: <span className="font-semibold text-slate-900 tabular-nums">{tVidAll} video</span> · <span className="font-semibold text-slate-900 tabular-nums">{fmtMinutes(tMinAll)}</span> — izlenen <span className="font-semibold text-slate-900 tabular-nums">{tWatchedAll}</span></span>
            <span className="hidden sm:flex items-center gap-3 text-[12px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> tamamlandı</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-300"></span> kısmi</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span> planlandı</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
