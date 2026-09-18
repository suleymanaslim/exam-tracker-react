import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Trash2, Calendar as CalendarIcon, Download, Clock, Image as ImageIcon, Settings } from 'lucide-react'
import Swal from 'sweetalert2'
import html2canvas from 'html2canvas'
import { useAdminStore } from '../lib/adminStore'

interface Resource { id: string; subject_id: string; name: string; resource_type: string; total_videos: number; avg_video_duration: number; subject_name?: string }
interface VideoPlanItem { id: string; resource_id: string; date: string; video_count: number }

export default function VideoPlan() {
  const [userId, setUserId] = useState<string | null>(null)
  const [resources, setResources] = useState<Resource[]>([])
  const [planItems, setPlanItems] = useState<VideoPlanItem[]>([])
  const [loading, setLoading] = useState(true)
  const { impersonatedUserId } = useAdminStore()
  const calendarRef = useRef<HTMLDivElement>(null)

  // Edit resource
  const [editingRes, setEditingRes] = useState<Resource | null>(null)
  const [editTotal, setEditTotal] = useState('')
  const [editAvg, setEditAvg] = useState('')

  // Selected Resource for assigning to days
  const [selectedResId, setSelectedResId] = useState<string | null>(null)

  // Calendar dates setup (30 days from today, or standard month. Let's do 30 days starting from this Monday or today)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setHours(0,0,0,0)
    // Go to previous Monday
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(d.setDate(diff))
  })

  // Generating 35 days (5 weeks)
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
      supabase.from('resources').select('*').eq('user_id', uid).eq('resource_type', 'video_ders'),
      supabase.from('video_plan_items').select('*').eq('user_id', uid),
      supabase.from('subjects').select('id, name').eq('user_id', uid)
    ])
    
    if (resData.data && subjectsData.data) {
      const merged = resData.data.map(r => ({
        ...r,
        subject_name: subjectsData.data.find(s => s.id === r.subject_id)?.name || 'Bilinmeyen Ders'
      }))
      setResources(merged)
    }
    if (planData.data) setPlanItems(planData.data)
    setLoading(false)
  }

  // Handle clicking a day
  const handleDayClick = async (dateObj: Date) => {
    if (!userId || !selectedResId) {
      Swal.fire({ title: 'Kaynak Seçin', text: 'Takvime eklemek için önce sol taraftan bir video ders kaynağı seçmelisiniz.', icon: 'info', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 })
      return
    }

    const dateStr = dateObj.toISOString().split('T')[0]
    const res = resources.find(r => r.id === selectedResId)
    if (!res) return

    const { value: countStr } = await Swal.fire({
      title: 'Kaç Video?',
      text: `${res.name} kaynağından bu güne kaç video eklemek istiyorsunuz?`,
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
    setEditingRes(null)
  }

  // Exports
  const exportImage = async () => {
    if (!calendarRef.current) return
    try {
      const canvas = await html2canvas(calendarRef.current, { scale: 2, backgroundColor: '#ffffff' })
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
      olusturulma_tarihi: new Date().toISOString(),
      planlar: planItems.map(p => {
        const res = resources.find(r => r.id === p.resource_id)
        return {
          tarih: p.date,
          ders: res?.subject_name,
          kaynak: res?.name,
          video_sayisi: p.video_count,
          tahmini_sure_dk: (p.video_count * (res?.avg_video_duration || 0))
        }
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
          <p className="text-[13px] text-[#64748b] mt-1">Video dersleri takvime sürükle, kalan sayıyı gör.</p>
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
          <div className="p-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <h2 className="text-[13px] font-bold text-[#0f172a] uppercase tracking-wider">Video Ders Kaynakları</h2>
            <p className="text-[11px] text-[#64748b] mt-1">Takvime eklemek için önce bir kaynağa tıklayın.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {resources.length === 0 ? (
              <div className="text-center text-xs text-[#94a3b8] py-8">
                Henüz "Video Ders" türünde eklenmiş bir kaynak yok. Ayarlar menüsünden kaynak ekleyebilirsiniz.
              </div>
            ) : (
              resources.map(res => {
                const isSelected = selectedResId === res.id
                // Calculate used videos
                const used = planItems.filter(p => p.resource_id === res.id).reduce((sum, p) => sum + p.video_count, 0)
                const remaining = Math.max(0, (res.total_videos || 0) - used)

                return (
                  <div 
                    key={res.id} 
                    onClick={() => setSelectedResId(res.id)}
                    className={`border rounded-lg p-3 cursor-pointer transition-all ${isSelected ? 'border-[#2563eb] bg-blue-50 ring-1 ring-[#2563eb]' : 'border-[#e2e8f0] bg-white hover:border-blue-300'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-bold bg-[#e2e8f0] text-[#475569] px-2 py-0.5 rounded-full">{res.subject_name}</span>
                        <h3 className="text-[13px] font-bold text-[#0f172a] mt-1.5">{res.name}</h3>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleEditResource(res); }} className="p-1 hover:bg-[#e2e8f0] rounded text-[#64748b]">
                        <Settings className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {editingRes?.id === res.id ? (
                      <div className="mt-3 p-2 bg-white rounded border border-[#e2e8f0] space-y-2" onClick={e => e.stopPropagation()}>
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
                          <button onClick={() => setEditingRes(null)} className="h-6 px-2 text-[10px] bg-[#f1f5f9] text-[#64748b] rounded font-medium">İptal</button>
                          <button onClick={saveEditResource} className="h-6 px-2 text-[10px] bg-[#2563eb] text-white rounded font-medium">Kaydet</button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 text-[#64748b]">
                          <Clock className="h-3 w-3" /> {res.avg_video_duration || 0} dk/video
                        </div>
                        <div className="font-semibold text-[#0f172a]">
                          Kalan: <span className={remaining === 0 ? 'text-emerald-500' : 'text-[#2563eb]'}>{remaining}</span> / {res.total_videos || 0}
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
        <div className="flex-1 bg-white border border-[#e2e8f0] rounded-xl flex flex-col min-h-0 overflow-hidden">
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
                  const dateStr = d.toISOString().split('T')[0]
                  const dayItems = planItems.filter(p => p.date === dateStr)
                  
                  // Calculate total time for the day
                  let totalMinutes = 0
                  dayItems.forEach(item => {
                    const res = resources.find(r => r.id === item.resource_id)
                    if (res) totalMinutes += (item.video_count * (res.avg_video_duration || 0))
                  })

                  const isToday = dateStr === new Date().toISOString().split('T')[0]

                  return (
                    <div 
                      key={dateStr}
                      onClick={() => handleDayClick(d)}
                      className={`border rounded-lg p-2 flex flex-col transition-all cursor-pointer hover:border-[#2563eb] ${isToday ? 'border-[#2563eb] bg-blue-50/30' : 'border-[#e2e8f0] bg-white'}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-[12px] font-bold ${isToday ? 'text-[#2563eb] bg-blue-100 rounded-full px-2' : 'text-[#0f172a]'}`}>
                          {d.getDate()} {d.toLocaleDateString('tr-TR', { month: 'short' })}
                        </span>
                        {totalMinutes > 0 && (
                          <span className="text-[10px] font-semibold text-[#64748b] bg-[#f1f5f9] px-1.5 py-0.5 rounded">
                            {Math.floor(totalMinutes / 60) > 0 ? `${Math.floor(totalMinutes / 60)}s ` : ''}{totalMinutes % 60}dk
                          </span>
                        )}
                      </div>
                      
                      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                        {dayItems.map(item => {
                          const res = resources.find(r => r.id === item.resource_id)
                          return (
                            <div key={item.id} className="bg-blue-50 border border-blue-100 rounded p-1.5 flex justify-between items-center group relative text-left">
                              <div className="flex flex-col min-w-0 pr-4">
                                <span className="text-[9px] font-bold text-blue-700 truncate">{res?.name || 'Bilinmeyen'}</span>
                                <span className="text-[10px] text-blue-900 font-semibold">{item.video_count} Video</span>
                              </div>
                              <button onClick={(e) => handleDeleteItem(e, item.id)} className="absolute right-1 top-1.5 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all">
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
