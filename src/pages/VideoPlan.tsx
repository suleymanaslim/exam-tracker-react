import './SuitePages.css'
import './VideoPlan.css'
import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { supabase, getCurrentUser } from '../lib/supabase'
import { Plus, Download, Printer, Settings, EyeOff, ChevronDown } from 'lucide-react'
import Swal from 'sweetalert2'
import { useAdminStore } from '../lib/adminStore'
import { playlistURL } from '../lib/playlist'
import { openVideoPlanPrint } from '../lib/videoPlanPrint'
import { buildVideoPlanExport } from '../lib/videoPlanExport'
import ResetVideoProgressButton from '../components/ResetVideoProgressButton'
import { isSplitVideo, isPendingVideo, videoDisplayDate, watchedVideos, videoPartLabel } from '../lib/videoWatch'
import type { VideoWatchState } from '../lib/videoWatch'
import { fetchVideoPlanItems } from '../lib/videoPlanData'
import VideoWeekCalendar from '../components/VideoWeekCalendar'
import VideoActionMenu from '../components/VideoActionMenu'

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
interface VideoPlanItem extends VideoWatchState {
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
  const [loadError, setLoadError] = useState('')
  const ownerRef = useRef<string | null>(null)
  const loadVersion = useRef(0)


  /* editing */
  const [editingRes, setEditingRes] = useState<Resource | null>(null)
  const [editTotal, setEditTotal] = useState('')
  const [editAvg, setEditAvg] = useState('')
  const [editPlaylistURL, setEditPlaylistURL] = useState('')
  const [savingResource, setSavingResource] = useState(false)

  /* selection */
  const [selectedResId, setSelectedResId] = useState<string | null>(null)
  const [mobileResourcesOpen, setMobileResourcesOpen] = useState(false)

  /* calendar start */
  const [startDate, setStartDate] = useState(() => getMonday(new Date()))

  const [selectedDay, setSelectedDay] = useState(() => (new Date().getDay() + 6) % 7)

  const days = useMemo(() => Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    return d
  }), [startDate])

  /* ─── Data ─── */
  const loadData = useCallback(async (uid: string) => {
    const version = ++loadVersion.current
    setLoading(true); setLoadError('')
    try {
      const [resR, planR, subR] = await Promise.all([
        supabase.from('resources').select('*').eq('user_id', uid),
        fetchVideoPlanItems(supabase, uid),
        supabase.from('subjects').select('id, name').eq('user_id', uid),
      ])
      for (const result of [resR, planR, subR]) if (result.error) throw result.error
      if (ownerRef.current !== uid || version !== loadVersion.current) return
      const subjectsById = new Map((subR.data || []).map(subject => [subject.id, subject]))
      const merged = (resR.data || []).map(r => ({ ...r, subject_name: subjectsById.get(r.subject_id)?.name || 'Bilinmeyen Ders' }))
      setAllResources(merged); setResources(merged.filter(r => r.resource_type === 'video_ders'))
      setPlanItems(planR.data || [])
    } catch {
      if (ownerRef.current === uid && version === loadVersion.current) setLoadError('Video planı yüklenemedi. Bağlantını kontrol edip tekrar dene.')
    } finally { if (ownerRef.current === uid && version === loadVersion.current) setLoading(false) }
  }, [])

  useEffect(() => {
    let active = true
    ownerRef.current = null; loadVersion.current++
    setUserId(null); setPlanItems([]); setResources([]); setAllResources([]); setSelectedResId(null); setLoading(true)
    void getCurrentUser().then(({ data: { user } }) => {
      if (!active) return
      if (!user) { setLoading(false); return }
      const uid = impersonatedUserId || user.id
      ownerRef.current = uid; setUserId(uid); void loadData(uid)
    })
    return () => { active = false; ownerRef.current = null; loadVersion.current++ }
  }, [impersonatedUserId, loadData])

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
          ${[1,2,3,4,5,6].map(n => `<button class="swal-quick-btn video-number-button" type="button" data-val="${n}" style="width:52px;height:44px;border-radius:10px;border:2px solid #e2e8f0;background:#f8fafc;font-size:16px;font-weight:700;color:#334155;cursor:pointer;transition:all .15s">${n}</button>`).join('')}
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

  const handleDeleteItem = async (id: string) => {
    const item = planItems.find(item => item.id === id)
    if (item?.completion_week) {
      const result = await Swal.fire({ title: 'İzleme kaydı silinsin mi?', text: 'İzlediğiniz video kaydedildi. Silerseniz bu kayıt ve izlenen 1 video toplamdan çıkarılacak.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Kaydı sil', cancelButtonText: 'Vazgeç', confirmButtonColor: '#b94646' })
      if (!result.isConfirmed) return
    }
    const { error } = await supabase.from('video_plan_items').delete().eq('id', id).eq('user_id', userId!)
    if (error) { await showPlanError(error); return }
    setPlanItems(p => p.filter(i => i.id !== id))
  }

  const handleClearDay = async (dateStr: string) => {
    const dayItems = planItems.filter(p => videoDisplayDate(p) === dateStr)
    if (dayItems.length === 0) return
    const c = await Swal.fire({
      title: 'Günü Temizle',
      text: dayItems.some(item => item.completion_week) ? `İzlediğiniz video kaydedildi. Bu gündeki ${dayItems.length} kayıt silinecek; kaydedilmiş videolar izlenme toplamından çıkarılacak.` : `${dayItems.length} video planı silinecek.`,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Sil', cancelButtonText: 'Vazgeç',
      confirmButtonColor: '#ef4444',
    })
    if (c.isConfirmed && userId) {
      const { error } = await supabase.from('video_plan_items').delete().in('id', dayItems.map(d => d.id))
      if (error) { await showPlanError(error); return }
      setPlanItems(p => p.filter(i => videoDisplayDate(i) !== dateStr))
    }
  }

  const handleSwapDays = useCallback(async (src: string, tgt: string) => {
    if (src === tgt || !userId) return
    const srcItems = planItems.filter(p => !p.completion_week && p.date === src)
    const tgtItems = planItems.filter(p => !p.completion_week && p.date === tgt)
    if (!srcItems.length && !tgtItems.length) return

    setLoading(true)
    const batch: any[] = []
    srcItems.forEach(i => batch.push({ id: i.id, user_id: userId, resource_id: i.resource_id, video_count: i.video_count, date: tgt }))
    tgtItems.forEach(i => batch.push({ id: i.id, user_id: userId, resource_id: i.resource_id, video_count: i.video_count, date: src }))

    const { error } = await supabase.from('video_plan_items').upsert(batch)
    if (error) await showPlanError(error)
    if (!error) {
      setPlanItems(prev => {
        const dates = new Map(batch.map(item => [item.id, item.date]))
        return prev.map(item => dates.has(item.id) ? { ...item, date: dates.get(item.id)! } : item)
      })
      Swal.fire({ icon: 'success', title: 'Taşındı!', toast: true, position: 'top-end', showConfirmButton: false, timer: 1200 })
    }
    setLoading(false)
  }, [planItems, userId])

  const handleShiftPlan = async (dateStr: string) => {
    const c = await Swal.fire({
      title: 'Planı Kaydır', text: 'Bu tarihten sonrasını 1 gün ileri kaydır.',
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Kaydır', cancelButtonText: 'Vazgeç',
      confirmButtonColor: '#2563eb',
    })
    if (!c.isConfirmed || !userId) return
    const items = planItems.filter(p => !p.completion_week && p.date >= dateStr)
    if (!items.length) { Swal.fire('Bilgi', 'Kaydırılacak plan yok.', 'info'); return }

    setLoading(true)
    const batch = items.map(i => {
      const d = new Date(`${i.date}T12:00:00`); d.setDate(d.getDate() + 1)
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
    if (!userId || !res || item.completion_week) return
    const owner = userId
    const split = isSplitVideo(item)
    const total = split ? item.watch_parts_total! : 2
    let choice: { watched: number } | { total: number; done: number } = split
      ? { total, done: item.watch_parts_done || 0 } : { watched: watchedVideos(item) }
    const result = await Swal.fire<VideoPlanItem>({
      titleText: 'İzleme ilerlemesi',
      html: `<div class="video-number-grid" role="group" aria-label="İzlenen video sayısı">${Array.from({ length: item.video_count }, (_, index) => index + 1).map(number => `<button type="button" class="video-number-button" data-count="${number}" aria-label="${number} video izlendi" aria-pressed="${number === watchedVideos(item)}">${number}</button>`).join('')}</div><button type="button" class="video-number-reset" data-count="0">İzlenmedi · sıfırla</button>`
        + (item.video_count === 1 ? `<section class="video-parts-dialog"><label>Uzun videoyu parçalı izle<select id="video-parts-total" aria-label="Video parça sayısı">${[2, 3, 4].map(parts => `<option value="${parts}" ${parts === total ? 'selected' : ''}>${parts} parça</option>`).join('')}</select></label><div id="video-parts-options" class="video-parts-options" role="group" aria-label="Tamamlanan parçalar"></div><p>Parçalar saklanır. Tamamı bittiğinde bu haftanın pazartesisine 1 video kaydedilir.</p></section>` : ''),
      showCancelButton: true, confirmButtonText: 'Kaydet', cancelButtonText: 'Vazgeç',
      showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(), allowEscapeKey: () => !Swal.isLoading(),
      didOpen: () => {
        const popup = Swal.getPopup()!
        const sync = () => {
          popup.querySelectorAll<HTMLButtonElement>('[data-count]').forEach(button => button.setAttribute('aria-pressed', String('watched' in choice && Number(button.dataset.count) === choice.watched)))
          popup.querySelectorAll<HTMLButtonElement>('[data-part]').forEach(button => button.setAttribute('aria-pressed', String('done' in choice && Number(button.dataset.part) === choice.done)))
        }
        const renderParts = (parts: number) => {
          const container = popup.querySelector('#video-parts-options')
          if (!container) return
          container.replaceChildren()
          for (let done = 0; done <= parts; done++) {
            const button = document.createElement('button')
            button.type = 'button'; button.className = 'video-part-button'; button.dataset.part = String(done)
            button.textContent = done === parts ? 'Tamamı' : `${done}/${parts}`
            button.setAttribute('aria-label', `${parts} parçadan ${done} tamamlandı`)
            button.addEventListener('click', () => { choice = { total: parts, done }; sync() })
            container.append(button)
          }
          sync()
        }
        popup.querySelectorAll<HTMLButtonElement>('[data-count]').forEach(button => button.addEventListener('click', () => {
          const watched = Number(button.dataset.count)
          const selectedTotal = 'total' in choice ? choice.total : total
          choice = split || 'total' in choice ? { total: selectedTotal, done: watched ? selectedTotal : 0 } : { watched }; sync()
        }))
        const select = popup.querySelector<HTMLSelectElement>('#video-parts-total')
        select?.addEventListener('change', () => { const parts = Number(select.value); choice = { total: parts, done: 0 }; renderParts(parts) })
        renderParts(total); sync()
      },
      preConfirm: async () => {
        if (ownerRef.current !== owner) return false
        try {
          const response = 'total' in choice
            ? await supabase.rpc('set_video_watch_parts', { p_item_id: item.id, p_total: choice.total, p_done: choice.done }).single()
            : await supabase.from('video_plan_items').update({ watched_count: choice.watched, is_completed: choice.watched >= item.video_count }).eq('id', item.id).eq('user_id', owner).select().single()
          if (response.error) throw response.error
          return response.data as VideoPlanItem
        } catch { Swal.showValidationMessage('İlerleme kaydedilemedi. Lütfen tekrar deneyin.'); return false }
      },
    })
    if (result.isConfirmed && result.value && ownerRef.current === owner) {
      const saved = result.value
      setPlanItems(prev => prev.map(current => current.id === saved.id ? saved : current))
      if (saved.completion_week) void Swal.fire({ icon: 'success', title: '1 video kaydedildi', text: 'Tamamlandığı haftanın pazartesi gününde görebilirsin.', timer: 2000, showConfirmButton: false })
    }
  }

  const handleMarkDayWatched = async (dayItems: VideoPlanItem[]) => {
    const uncompleted = dayItems.filter(item => !item.completion_week && watchedVideos(item) < item.video_count)
    if (!userId || !uncompleted.length) return
    if (uncompleted.some(isSplitVideo)) {
      const confirm = await Swal.fire({ title: 'Videoların tamamı izlendi mi?', text: 'Parçalı videoların kalan bölümleri de tamamlanmış sayılacak. Tamamlanan videolar bu haftanın pazartesisine kaydedilecek.', showCancelButton: true, confirmButtonText: 'Tamamı izlendi', cancelButtonText: 'Vazgeç' })
      if (!confirm.isConfirmed) return
    }
    const owner = userId
    setLoading(true)
    try {
      // Mixed/split batches are atomic; ordinary plans remain compatible with the existing schema.
      const response = uncompleted.some(isSplitVideo)
        ? await supabase.rpc('complete_video_plan_items', { p_item_ids: uncompleted.map(item => item.id) })
        : { data: null, error: null }
      // Ordinary rows have different video counts, so save a single upsert transaction.
      const normal = !uncompleted.some(isSplitVideo) ? await supabase.from('video_plan_items').upsert(uncompleted.map(item => ({ id: item.id, user_id: owner, resource_id: item.resource_id, date: item.date, video_count: item.video_count, watched_count: item.video_count, is_completed: true }))).select() : response
      if (normal.error) throw normal.error
      if (!normal.data || normal.data.length !== uncompleted.length) throw new Error('Save could not be verified')
      if (ownerRef.current === owner) {
        const saved = new Map((normal.data as VideoPlanItem[]).map(item => [item.id, item]))
        setPlanItems(prev => prev.map(item => saved.get(item.id) || item))
      }
    } catch { void Swal.fire('Kaydedilemedi', 'Videoların izlenme durumu kaydedilemedi. Tekrar deneyin.', 'error') }
    finally { if (ownerRef.current === owner) setLoading(false) }
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

  const movingItem = useRef(false)
  const handleMoveItem = async (item: VideoPlanItem, date: string): Promise<boolean> => {
    const current = planItems.find(value => value.id === item.id)
    if (!userId || ownerRef.current !== userId || movingItem.current || !current || current.completion_week || current.date === date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
    const owner = userId
    movingItem.current = true
    try {
      const sortOrder = Math.max(-1, ...planItems.filter(value => value.date === date).map(value => value.sort_order || 0)) + 1
      const { data, error } = await supabase.from('video_plan_items').update({ date, sort_order: sortOrder })
        .eq('id', item.id).eq('user_id', owner).eq('date', current.date).is('completion_week', null).select().single()
      if (error || !data || data.id !== item.id || data.date !== date) throw error || new Error('Move could not be verified')
      if (ownerRef.current !== owner) return false
      setPlanItems(previous => previous.map(value => value.id === item.id ? data as VideoPlanItem : value))
      return true
    } catch {
      if (ownerRef.current === owner) void Swal.fire('Taşınamadı', 'Video taşınamadı. Planı yenileyip tekrar deneyin; izleme ilerlemeniz korunuyor.', 'error')
      return false
    } finally { movingItem.current = false }
  }

  /* reorder items within a day */
  const handleReorderItem = async (item: VideoPlanItem, dir: -1 | 1) => {
    if (item.completion_week) return
    const dayItems = planItems
      .filter(p => !p.completion_week && p.date === item.date)
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
    const data = buildVideoPlanExport(days.map(localDateStr), planItems, allResources)
    const b = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'video_plani.json'; a.click(); URL.revokeObjectURL(u);
  }

  const calendarRef = useRef<HTMLDivElement>(null)
  const printPlan = () => {
    if (calendarRef.current && !openVideoPlanPrint(calendarRef.current)) {
      void Swal.fire('Sayfa açılamadı', 'Yazdırma görünümünü açmak için bu siteye açılır pencere izni verin.', 'info')
    }
  }

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-slate-400">Yükleniyor…</span>
      </div>
    </div>
  )

  return (
    <div className="suite-page suite-videoplan flex flex-col gap-3 p-3 max-w-[1500px] mx-auto bg-slate-100 text-slate-900">
      {/* HEADER */}
      <div className="video-plan-header">
        <div>
          <p className="suite-eyebrow">VİDEO PROGRAMIN</p>
          <h1 className="text-lg font-semibold tracking-tight">Video planı</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {selectedResId ? <span className="text-slate-700 font-medium">Ders seçili — takvimde bir güne tıklayıp video sayısını seçin</span> : 'Soldan ders seçip güne ekleyin. İzlemeyi güncellemek için karta dokunun.'}
          </p>
        </div>
        <div className="video-plan-toolbar">
          <Link to="/questions" className="video-toolbar-link">Soru planı</Link>
          <div className="video-week-navigation" aria-label="Video planı haftası">
            <button type="button" aria-label="Önceki hafta" onClick={() => { const date = new Date(startDate); date.setDate(date.getDate() - 7); setStartDate(date) }}>‹</button>
            <strong>{days[0].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – {days[6].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
            <button type="button" aria-label="Sonraki hafta" onClick={() => { const date = new Date(startDate); date.setDate(date.getDate() + 7); setStartDate(date) }}>›</button>
            <button type="button" className="video-today-button" onClick={() => { setStartDate(getMonday(new Date())); setSelectedDay((new Date().getDay() + 6) % 7) }}>Bugün</button>
          </div>
          <VideoActionMenu label="Dışa aktar" className="video-export-trigger" actions={[
            { label: 'Yazdır / PDF', icon: <Printer size={16} />, onSelect: printPlan },
            { label: 'Veri (JSON)', icon: <Download size={16} />, onSelect: exportJSON },
          ]}><Download size={15} /> Dışa aktar <ChevronDown size={13} /></VideoActionMenu>
        </div>
      </div>

      {loadError && <div className="video-load-error" role="alert">{loadError}<button type="button" onClick={() => userId && void loadData(userId)}>Tekrar dene</button></div>}
      {/* MAIN */}
      <div className="video-plan-columns flex flex-col lg:flex-row gap-3 min-h-0">

        {/* LEFT: Dersler */}
        <div className={`video-resource-panel ${mobileResourcesOpen ? 'is-expanded' : ''} w-full lg:w-64 flex flex-col shrink-0 lg:min-h-0 max-h-[240px] lg:max-h-none overflow-hidden rounded-xl border border-slate-200 bg-white`}>
          <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between shrink-0">
            <span className="video-resource-title text-[14px] font-semibold flex items-center gap-2">Dersler
              <span className="text-[11px] text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5 font-semibold tabular-nums">{resources.length}</span>
            </span>
            <button type="button" className="video-resource-toggle" aria-expanded={mobileResourcesOpen} aria-controls="video-resource-list" onClick={() => setMobileResourcesOpen(value => !value)}><span>Dersler <b>{resources.length}</b></span>{selectedResId && <small>{cleanName(resources.find(resource => resource.id === selectedResId)?.name)}</small>}<ChevronDown size={14} /></button>
            <button onClick={handleAddResourceToPlan} className="h-6 px-2 rounded-md bg-slate-900 text-white flex items-center gap-1 text-[12px] font-medium hover:bg-slate-700 transition-colors">
              <Plus className="h-3 w-3" /> Ekle
            </button>
          </div>
            {planItems.some(isPendingVideo) && <section className="video-resume" aria-label="Yarım kalan videolar"><h2>Kaldığın yerden</h2>{planItems.filter(isPendingVideo).map(item => {
              const resource = allResources.find(resource => resource.id === item.resource_id)
              return <button type="button" key={item.id} className="video-resume-item" onClick={event => { event.stopPropagation(); void handleProgressClick(item, resource) }}><span><strong>{cleanName(resource?.name) || 'Video'}</strong><small>{new Date(`${item.date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} planı</small></span><b>{videoPartLabel(item)}</b></button>
            })}</section>}
          <div id="video-resource-list" className="video-resource-list flex-1 overflow-y-auto">

            {resources.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
                <p className="text-xs">Henüz kaynak yok</p>
                <p className="text-[11px] text-slate-300">Üstteki Ekle ile kaynak ekleyin</p>
              </div>
            ) : (
              resources.map(res => {
                const c = hashColor(res.subject_id)
                const items = planItems.filter(p => p.resource_id === res.id)
                const watched = items.reduce((s, p) => s + (watchedVideos(p)), 0)
                const total = res.total_videos || 0
                const remaining = Math.max(0, total - watched)
                const done = total > 0 && remaining === 0
                const pct = total > 0 ? Math.min(100, Math.round((watched / total) * 100)) : 0
                const sel = selectedResId === res.id

                return (
                  <div key={res.id} onClick={() => { setSelectedResId(sel ? null : res.id); setMobileResourcesOpen(false) }}
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
                        {userId && <ResetVideoProgressButton key={`${userId}:${res.id}`} userId={userId} resourceId={res.id} resourceName={res.name} disabled={savingResource} onReset={() => setPlanItems(current => current.map(item => item.resource_id === res.id && !item.completion_week ? { ...item, watched_count: 0, is_completed: false, watch_parts_done: 0 } : item))} />}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-[12px] text-slate-400 mt-1.5 ml-4">
                          <span><span className="text-slate-600 font-medium tabular-nums">{watched}</span>/{total} video</span>
                          {done ? <span className="text-emerald-600 font-medium">tamamlandı</span> : <span>kalan <span className="text-slate-600 font-medium tabular-nums">{remaining}</span> video · {fmtMinutes(remaining * (res.avg_video_duration || 0))}</span>}
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

        <div ref={calendarRef} className="video-week-calendar">
          <VideoWeekCalendar days={days} items={planItems} resources={allResources} color={hashColor}
            selectedDay={selectedDay} onSelectDay={setSelectedDay} onAdd={date => void handleDayClick(date)}
            onProgress={(item, resource) => void handleProgressClick(item, resource)}
            onDelete={id => void handleDeleteItem(id)} onReorder={(item, direction) => void handleReorderItem(item, direction)}
            onClear={date => void handleClearDay(date)} onShift={date => void handleShiftPlan(date)}
            onMove={handleMoveItem} onCompleteDay={items => void handleMarkDayWatched(items)} onSwap={(from, to) => void handleSwapDays(from, to)} />
        </div>
      </div>
    </div>
  )
}

