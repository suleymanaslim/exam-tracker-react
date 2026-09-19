import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Calendar as CalendarIcon, Download, Clock, Image as ImageIcon, Settings, EyeOff, SkipForward, GripHorizontal } from 'lucide-react'
import Swal from 'sweetalert2'
import html2canvas from 'html2canvas'
import { useAdminStore } from '../lib/adminStore'

interface Resource { id: string; subject_id: string; name: string; resource_type: string; total_videos: number; avg_video_duration: number; subject_name?: string }
interface VideoPlanItem { id: string; resource_id: string; date: string; video_count: number }

const COLORS = [
  { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' }, // blue
  { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' }, // emerald
  { bg: '#fef3c7', text: '#b45309', border: '#fde68a' }, // amber
  { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' }, // violet
  { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' }, // rose
  { bg: '#eef2ff', text: '#4338ca', border: '#c7d2fe' }, // indigo
  { bg: '#f0fdfa', text: '#0f766e', border: '#ccfbf1' }, // teal
]

export default function VideoPlan() {
  const [userId, setUserId] = useState<string | null>(null)
  const [allResources, setAllResources] = useState<Resource[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [planItems, setPlanItems] = useState<VideoPlanItem[]>([])
  const [loading, setLoading] = useState(true)
  const { impersonatedUserId } = useAdminStore()
  const calendarRef = useRef<HTMLDivElement>(null)

  const [editingRes, setEditingRes] = useState<Resource | null>(null)
  const [editTotal, setEditTotal] = useState('')
  const [editAvg, setEditAvg] = useState('')
  const [selectedResId, setSelectedResId] = useState<string | null>(null)

  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setHours(0,0,0,0)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(d.setDate(diff))
  })

  const localDateStr = (d: Date) => {
    const offset = d.getTimezoneOffset()
    const adjusted = new Date(d.getTime() - (offset*60*1000))
    return adjusted.toISOString().split('T')[0]
  }

  const days = Array.from({ length: 35 }).map((_, i) => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    return d
  })

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
    setLoading(true)
    const [resData, planData, subjectsData] = await Promise.all([
      supabase.from('resources').select('*').eq('user_id', uid),
      supabase.from('video_plan_items').select('*').eq('user_id', uid),
      supabase.from('subjects').select('id, name').eq('user_id', uid)
    ])
    
    if (resData.data && subjectsData.data) {
      const merged = resData.data.map(r => ({
        ...r,
        subject_name: subjectsData.data.find(s => s.id === r.subject_id)?.name || 'Bilinmeyen Ders'
      }))
      setAllResources(merged)
      setResources(merged.filter(r => r.resource_type === 'video_ders'))
    }
    if (planData.data) setPlanItems(planData.data)
    setLoading(false)
  }

  const cleanName = (name: string) => {
    return (name || '').replace(/MEB-AGS|MEB AGS/g, '').trim()
  }

  const getSubjectColor = (subjectId: string) => {
    let hash = 0
    for (let i = 0; i < subjectId.length; i++) hash = subjectId.charCodeAt(i) + ((hash << 5) - hash)
    return COLORS[Math.abs(hash) % COLORS.length]
  }

  const handleDayClick = async (dateObj: Date) => {
    if (!userId || !selectedResId) {
      Swal.fire({ title: 'Kaynak Seçin', text: 'Takvime eklemek için önce sol taraftan bir video ders kaynağı seçmelisiniz.', icon: 'info', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 })
      return
    }

    const dateStr = localDateStr(dateObj)
    const res = resources.find(r => r.id === selectedResId)
    if (!res) return

    const { value: countStr } = await Swal.fire({
      title: 'Kaç Video?',
      text: `${cleanName(res.name)} kaynağından bu güne kaç video eklemek istiyorsunuz?`,
      input: 'number',
      inputAttributes: { min: '1', step: '1' },
      showCancelButton: true,
      confirmButtonText: 'Ekle',
      cancelButtonText: 'İptal'
    })

    if (countStr && parseInt(countStr) > 0) {
      const { data } = await supabase.from('video_plan_items').insert({
        user_id: userId,
        resource_id: selectedResId,
        date: dateStr,
        video_count: parseInt(countStr)
      }).select().single()

      if (data) setPlanItems(prev => [...prev, data])
    }
  }

  const handleDeleteItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const confirm = await Swal.fire({ title: 'Sil', text: 'Bu planı silmek istiyor musunuz?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Evet', cancelButtonText: 'İptal' })
    if (confirm.isConfirmed) {
      await supabase.from('video_plan_items').delete().eq('id', id)
      setPlanItems(prev => prev.filter(i => i.id !== id))
    }
  }

  const handleClearDay = async (e: React.MouseEvent, dateStr: string) => {
    e.stopPropagation()
    const dayItems = planItems.filter(p => p.date === dateStr)
    if (dayItems.length === 0) return
    const confirm = await Swal.fire({ title: 'Tüm Günü Sil', text: 'Bu gündeki tüm video planlarını silmek istediğinize emin misiniz?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Evet, Sil', cancelButtonText: 'İptal' })
    if (confirm.isConfirmed && userId) {
      const ids = dayItems.map(d => d.id)
      await supabase.from('video_plan_items').delete().in('id', ids)
      setPlanItems(prev => prev.filter(i => i.date !== dateStr))
    }
  }

  const handleSwapDays = async (sourceDate: string, targetDate: string) => {
    if (sourceDate === targetDate || !userId) return
    const sourceItems = planItems.filter(p => p.date === sourceDate)
    const targetItems = planItems.filter(p => p.date === targetDate)
    
    if (sourceItems.length === 0 && targetItems.length === 0) return
    
    setLoading(true)
    const updatedItems: any[] = []
    sourceItems.forEach(item => updatedItems.push({ id: item.id, user_id: userId, resource_id: item.resource_id, video_count: item.video_count, date: targetDate }))
    targetItems.forEach(item => updatedItems.push({ id: item.id, user_id: userId, resource_id: item.resource_id, video_count: item.video_count, date: sourceDate }))
    
    const { error } = await supabase.from('video_plan_items').upsert(updatedItems)
    if (!error) {
      setPlanItems(prev => {
        const filtered = prev.filter(p => p.date !== sourceDate && p.date !== targetDate)
        return [...filtered, ...updatedItems]
      })
      Swal.fire({ icon: 'success', title: 'Başarılı', text: 'Günler yer değiştirdi.', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 })
    }
    setLoading(false)
  }

  const handleShiftPlan = async (e: React.MouseEvent, dateStr: string) => {
    e.stopPropagation()
    const confirm = await Swal.fire({
      title: 'Planı Kaydır',
      text: 'Bu tarihten (dahil) sonraki tüm video planlarınızı 1 gün ileri kaydırmak istiyor musunuz?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Evet, Kaydır',
      cancelButtonText: 'İptal'
    })

    if (confirm.isConfirmed && userId) {
      const itemsToShift = planItems.filter(p => p.date >= dateStr)
      if (itemsToShift.length === 0) { Swal.fire('Bilgi', 'Kaydırılacak plan bulunamadı.', 'info'); return }

      setLoading(true)
      const updatedItems = itemsToShift.map(item => {
        const d = new Date(item.date)
        d.setDate(d.getDate() + 1)
        return { id: item.id, user_id: userId, resource_id: item.resource_id, video_count: item.video_count, date: localDateStr(d) }
      })
      
      const { error } = await supabase.from('video_plan_items').upsert(updatedItems)

      if (!error) {
        setPlanItems(prev => prev.map(p => {
          const updated = updatedItems.find(u => u.id === p.id)
          return updated ? { ...p, date: updated.date } : p
        }))
        Swal.fire('Başarılı', 'Program 1 gün ileri kaydırıldı.', 'success')
      }
      setLoading(false)
    }
  }

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
    setResources(prev => prev.map(r => r.id === editingRes.id ? { ...r, total_videos: t, avg_video_duration: a } : r))
    setAllResources(prev => prev.map(r => r.id === editingRes.id ? { ...r, total_videos: t, avg_video_duration: a } : r))
    setEditingRes(null)
  }

  const handleAddResourceToPlan = async () => {
    const otherResources = allResources.filter(r => r.resource_type !== 'video_ders')
    if (otherResources.length === 0) { Swal.fire('Bilgi', 'Listeye eklenebilecek başka bir kaynağınız bulunmuyor.', 'info'); return }

    const optionsHtml = otherResources.map(r => `<option value="${r.id}">${cleanName(r.subject_name || '')} - ${cleanName(r.name)}</option>`).join('')
    
    const { value: resId } = await Swal.fire({
      title: 'Video Planına Kaynak Ekle',
      html: `<select id="resource-select" class="swal2-select" style="width:100%; font-size:14px; padding: 8px;">
              <option value="" disabled selected>Bir kaynak seçin...</option>
              ${optionsHtml}
             </select>`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Ekle',
      preConfirm: () => {
        const val = (document.getElementById('resource-select') as HTMLSelectElement).value
        if (!val) Swal.showValidationMessage('Lütfen bir kaynak seçin.')
        return val
      }
    })

    if (resId) {
      const { value: details } = await Swal.fire({
        title: 'Video Bilgileri',
        html: `
          <input id="swal-tot" class="swal2-input" placeholder="Toplam Video Sayısı (Örn: 50)" type="number" min="1">
          <input id="swal-avg" class="swal2-input" placeholder="Ortalama Süre (Dk) (Örn: 30)" type="number" min="1">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Kaydet',
        cancelButtonText: 'Geç',
        preConfirm: () => ({
          tot: parseInt((document.getElementById('swal-tot') as HTMLInputElement).value) || 0,
          avg: parseInt((document.getElementById('swal-avg') as HTMLInputElement).value) || 0
        })
      })

      const tot = details?.tot || 0
      const avg = details?.avg || 0
      await supabase.from('resources').update({ resource_type: 'video_ders', total_videos: tot, avg_video_duration: avg }).eq('id', resId)
      
      const updatedRes = allResources.find(r => r.id === resId)
      if (updatedRes) {
        const newRes = { ...updatedRes, resource_type: 'video_ders', total_videos: tot, avg_video_duration: avg }
        setResources(prev => [...prev, newRes])
        setAllResources(prev => prev.map(r => r.id === resId ? newRes : r))
      }
      Swal.fire('Eklendi', 'Kaynak başarıyla eklendi.', 'success')
    }
  }

  const handleHideResource = async (res: Resource) => {
    const confirm = await Swal.fire({ title: 'Listeden Çıkar', text: `Gizlemek istiyor musunuz?`, icon: 'question', showCancelButton: true, confirmButtonText: 'Evet', cancelButtonText: 'İptal' })
    if (confirm.isConfirmed) {
      await supabase.from('resources').update({ resource_type: 'diger' }).eq('id', res.id)
      setResources(prev => prev.filter(r => r.id !== res.id))
      setAllResources(prev => prev.map(r => r.id === res.id ? { ...r, resource_type: 'diger' } : r))
      if (selectedResId === res.id) setSelectedResId(null)
    }
  }

  const exportImage = async () => {
    if (!calendarRef.current) return
    try {
      const origOverflow = calendarRef.current.style.overflow
      const origHeight = calendarRef.current.style.height
      calendarRef.current.style.overflow = 'visible'
      calendarRef.current.style.height = 'auto'
      
      // Allow DOM to update
      await new Promise(r => setTimeout(r, 100))
      
      const canvas = await html2canvas(calendarRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      
      calendarRef.current.style.overflow = origOverflow
      calendarRef.current.style.height = origHeight

      const link = document.createElement('a')
      link.download = 'video_plani.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error(err)
      Swal.fire('Hata', 'Görsel oluşturulurken bir hata oluştu.', 'error')
    }
  }

  const exportJSON = () => {
    const report = {
      olusturulma_tarihi: new Date().toLocaleString('tr-TR'),
      planlar: planItems.map(p => {
        const res = resources.find(r => r.id === p.resource_id)
        return { tarih: p.date, ders: cleanName(res?.subject_name || ''), kaynak: cleanName(res?.name || ''), video_sayisi: p.video_count, tahmini_sure_dk: (p.video_count * (res?.avg_video_duration || 0)) }
      })
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'video_plani.json'; a.click(); URL.revokeObjectURL(url)
  }

  if (loading) return <div className="h-full flex items-center justify-center text-[#94a3b8]">Yükleniyor...</div>

  return (
    <div className="flex flex-col h-full gap-4 pb-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between shrink-0 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a] flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-[#2563eb]" /> Video Planı
          </h1>
          <p className="text-[13px] text-[#64748b] mt-1">Video dersleri takvime sürükle veya "Taşı" ikonuyla günleri yer değiştir.</p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button onClick={exportImage} className="bg-white border border-[#e2e8f0] text-[#0f172a] hover:bg-slate-50 font-medium text-sm px-3 py-2 rounded-lg transition-all flex items-center gap-2">
            <ImageIcon className="h-4 w-4" /> PNG İndir
          </button>
          <button onClick={exportJSON} className="bg-[#2563eb] hover:bg-blue-600 text-white font-medium text-sm px-3 py-2 rounded-lg transition-all flex items-center gap-2">
            <Download className="h-4 w-4" /> JSON İndir
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 h-full min-h-0 overflow-hidden">
        {/* Sol Menü: Kaynaklar */}
        <div className="w-full lg:w-80 bg-white border border-[#e2e8f0] rounded-xl flex flex-col shrink-0 min-h-[300px] lg:min-h-0 overflow-hidden">
          <div className="p-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex justify-between items-start">
            <div>
              <h2 className="text-[13px] font-bold text-[#0f172a] uppercase tracking-wider">Video Dersler</h2>
              <p className="text-[10px] text-[#64748b] mt-1">Takvime eklemek için tıklayın.</p>
            </div>
            <button onClick={handleAddResourceToPlan} title="Mevcut kaynaklardan ekle" className="h-7 w-7 flex items-center justify-center bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-all">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {resources.length === 0 ? (
              <div className="text-center text-xs text-[#94a3b8] py-8">Kaynak yok. Ayarlar menüsünden kaynak ekleyebilirsiniz.</div>
            ) : (
              resources.map(res => {
                const isSelected = selectedResId === res.id
                const used = planItems.filter(p => p.resource_id === res.id).reduce((sum, p) => sum + p.video_count, 0)
                const remaining = Math.max(0, (res.total_videos || 0) - used)
                const col = getSubjectColor(res.subject_id)

                return (
                  <div 
                    key={res.id} 
                    onClick={() => setSelectedResId(res.id)}
                    className={`border rounded-xl p-3 cursor-pointer transition-all ${isSelected ? 'ring-2 ring-blue-500 shadow-sm' : 'hover:border-blue-300'}`}
                    style={{ backgroundColor: isSelected ? '#ffffff' : col.bg, borderColor: isSelected ? '#3b82f6' : col.border }}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.6)', color: col.text }}>
                          {cleanName(res.subject_name || '')}
                        </span>
                        <h3 className="text-[13px] font-bold mt-1.5" style={{ color: '#0f172a' }}>{cleanName(res.name)}</h3>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button onClick={(e) => { e.stopPropagation(); handleHideResource(res); }} title="Listeden Çıkar" className="p-1 hover:bg-white/50 rounded text-slate-500 hover:text-red-500 transition-all">
                          <EyeOff className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleEditResource(res); }} title="Düzenle" className="p-1 hover:bg-white/50 rounded text-slate-500 transition-all">
                          <Settings className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {editingRes?.id === res.id ? (
                      <div className="mt-3 p-2 bg-white/80 rounded border border-slate-200 space-y-2" onClick={e => e.stopPropagation()}>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] font-bold text-[#64748b] uppercase">Top. Video</label>
                            <input type="number" min="0" value={editTotal} onChange={e => setEditTotal(e.target.value)} className="w-full h-7 text-[11px] px-2 border border-[#e2e8f0] rounded focus:outline-none" />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-[#64748b] uppercase">Ort. Dk</label>
                            <input type="number" min="0" value={editAvg} onChange={e => setEditAvg(e.target.value)} className="w-full h-7 text-[11px] px-2 border border-[#e2e8f0] rounded focus:outline-none" />
                          </div>
                        </div>
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setEditingRes(null)} className="h-6 px-2 text-[10px] bg-slate-200 text-slate-600 rounded font-medium">İptal</button>
                          <button onClick={saveEditResource} className="h-6 px-2 text-[10px] bg-blue-600 text-white rounded font-medium">Kaydet</button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5" style={{ color: col.text }}>
                          <Clock className="h-3 w-3" /> {res.avg_video_duration || 0} dk/vid
                        </div>
                        <div className="font-semibold text-slate-700">
                          Kalan: <span className={remaining === 0 ? 'text-emerald-600' : ''} style={{ color: remaining > 0 ? col.text : undefined }}>{remaining}</span> / {res.total_videos || 0}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Sağ Menü: Takvim */}
        <div className="flex-1 bg-white border border-[#e2e8f0] rounded-xl flex flex-col min-h-0 overflow-hidden relative">
          <div className="p-4 border-b border-[#e2e8f0] flex justify-between items-center bg-[#f8fafc]">
            <h2 className="text-[13px] font-bold text-[#0f172a] uppercase tracking-wider">Aylık Görünüm</h2>
            <div className="flex gap-2">
              <button onClick={() => setStartDate(new Date(startDate.setDate(startDate.getDate() - 7)))} className="px-3 py-1 text-xs border border-[#e2e8f0] bg-white rounded-md hover:bg-slate-50 font-medium">Önceki Hafta</button>
              <button onClick={() => setStartDate(new Date(startDate.setDate(startDate.getDate() + 7)))} className="px-3 py-1 text-xs border border-[#e2e8f0] bg-white rounded-md hover:bg-slate-50 font-medium">Sonraki Hafta</button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto p-4" ref={calendarRef}>
            <div className="min-w-[700px] h-full flex flex-col">
              {/* Hafta Günleri */}
              <div className="grid grid-cols-7 gap-2 mb-2 shrink-0">
                {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'].map(day => (
                  <div key={day} className="text-center text-[11px] font-bold text-[#64748b] uppercase tracking-wider py-1">
                    {day}
                  </div>
                ))}
              </div>
              
              {/* 35 Günlük Grid */}
              <div className="grid grid-cols-7 gap-2 flex-1 auto-rows-fr">
                {days.map((d) => {
                  const dateStr = localDateStr(d)
                  const dayItems = planItems.filter(p => p.date === dateStr)
                  
                  let totalMinutes = 0
                  dayItems.forEach(item => {
                    const res = allResources.find(r => r.id === item.resource_id)
                    if (res) totalMinutes += (item.video_count * (res.avg_video_duration || 0))
                  })

                  const isToday = dateStr === localDateStr(new Date())

                  return (
                    <div 
                      key={dateStr}
                      onClick={() => handleDayClick(d)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        const source = e.dataTransfer.getData('sourceDate')
                        if (source) handleSwapDays(source, dateStr)
                      }}
                      className={`border rounded-lg p-2 flex flex-col transition-all cursor-pointer hover:border-[#2563eb] hover:shadow-sm ${isToday ? 'border-[#2563eb] bg-blue-50/20 ring-1 ring-blue-500/20' : 'border-[#e2e8f0] bg-white'}`}
                    >
                      <div className="flex justify-between items-start mb-2 group/header">
                        <div className="flex items-center gap-1.5">
                          <div 
                            draggable 
                            onDragStart={(e) => { e.dataTransfer.setData('sourceDate', dateStr); e.stopPropagation(); }}
                            title="Bu günü başka bir güne sürükleyip yer değiştirebilirsiniz"
                            className="cursor-grab hover:text-blue-500 text-slate-300"
                            onClick={e => e.stopPropagation()}
                          >
                            <GripHorizontal className="h-4 w-4" />
                          </div>
                          <span className={`text-[12px] font-bold ${isToday ? 'text-[#2563eb] bg-blue-100 rounded-full px-2' : 'text-[#0f172a]'}`}>
                            {d.getDate()} {d.toLocaleDateString('tr-TR', { month: 'short' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {dayItems.length > 0 && (
                            <button onClick={(e) => handleClearDay(e, dateStr)} title="Tüm Günü Temizle" className="opacity-0 group-hover/header:opacity-100 text-slate-300 hover:text-red-500 p-0.5 transition-all">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={(e) => handleShiftPlan(e, dateStr)} title="Bu gün ve sonrasını 1 gün ertele" className="opacity-0 group-hover/header:opacity-100 text-slate-300 hover:text-[#2563eb] p-0.5 transition-all">
                            <SkipForward className="h-3.5 w-3.5" />
                          </button>
                          {totalMinutes > 0 && (
                            <span className="text-[10px] font-semibold text-[#64748b] bg-[#f1f5f9] px-1.5 py-0.5 rounded">
                              {Math.floor(totalMinutes / 60) > 0 ? `${Math.floor(totalMinutes / 60)}sa ` : ''}{totalMinutes % 60}dk
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                        {dayItems.map(item => {
                          const res = resources.find(r => r.id === item.resource_id)
                          const col = res ? getSubjectColor(res.subject_id) : { bg: '#f1f5f9', border: '#e2e8f0', text: '#475569' }
                          return (
                            <div key={item.id} className="border rounded p-1.5 flex justify-between items-center group relative text-left transition-all" style={{ backgroundColor: col.bg, borderColor: col.border }}>
                              <div className="flex flex-col min-w-0 pr-4">
                                <span className="text-[9px] font-bold truncate opacity-80" style={{ color: col.text }}>{cleanName(res?.subject_name || '')}</span>
                                <span className="text-[10.5px] font-bold truncate" style={{ color: col.text }}>{cleanName(res?.name || 'Bilinmeyen')}</span>
                                <span className="text-[9.5px] font-semibold mt-0.5" style={{ color: col.text }}>{item.video_count} Video</span>
                              </div>
                              <button onClick={(e) => handleDeleteItem(e, item.id)} className="absolute right-1 top-1.5 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all bg-white/80 rounded-sm p-0.5">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
