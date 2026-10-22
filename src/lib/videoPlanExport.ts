import { videoDisplayDate, watchedVideos } from './videoWatch.ts'

interface ExportItem {
  resource_id: string
  date: string
  video_count: number
  watched_count?: number
  is_completed?: boolean
  sort_order?: number
  watch_parts_total?: number
  watch_parts_done?: number
  completion_week?: string | null
  planned_date?: string | null
}
interface ExportResource {
  id: string
  name: string
  subject_name?: string
  avg_video_duration: number
}
const cleanName = (name?: string) => (name || '').replace(/MEB[-\s]?AGS/gi, '').trim()

export function buildVideoPlanExport(dates: string[], items: ExportItem[], resources: ExportResource[]) {
  const summary = { toplam_video: 0, toplam_dk: 0, izlenen_video: 0 }
  const days = dates.map(date => {
    const plans = items.filter(item => videoDisplayDate(item) === date)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(item => {
        const resource = resources.find(value => value.id === item.resource_id)
        const minutes = item.video_count * (resource?.avg_video_duration || 0)
        summary.toplam_video += item.video_count
        summary.toplam_dk += minutes
        summary.izlenen_video += watchedVideos(item)
        return {
          ders: cleanName(resource?.subject_name), kaynak: cleanName(resource?.name),
          video: item.video_count, izlenen: watchedVideos(item),
          tamamlandi: !!item.is_completed, sure_dk: minutes,
          ...(item.watch_parts_total && item.watch_parts_total > 1 ? { toplam_parca: item.watch_parts_total, izlenen_parca: item.watch_parts_done || 0, kayit_haftasi: item.completion_week || null, planlanan_tarih: item.planned_date || item.date } : {}),
        }
      })
    return { tarih: date, planlar: plans }
  })
  return { hafta: { baslangic: dates[0], bitis: dates[dates.length - 1] }, ozet: summary, gunler: days }
}
