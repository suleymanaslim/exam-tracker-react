export interface VideoWatchState {
  id: string
  date: string
  video_count: number
  watched_count?: number
  is_completed?: boolean
  watch_parts_total?: number
  watch_parts_done?: number
  completion_week?: string | null
  planned_date?: string | null
}

/** Completion records appear on Monday; the original plan date is preserved. */
export function videoDisplayDate(item: Pick<VideoWatchState, 'date' | 'completion_week'>) {
  return item.completion_week || item.date
}
export function isSplitVideo(item: Pick<VideoWatchState, 'video_count' | 'watch_parts_total'>) {
  return item.video_count === 1 && (item.watch_parts_total || 1) > 1
}
export function isPendingVideo(item: VideoWatchState) {
  return isSplitVideo(item) && !item.completion_week && (item.watch_parts_done || 0) > 0 && (item.watch_parts_done || 0) < item.watch_parts_total!
}
export function watchedVideos(item: Pick<VideoWatchState, 'video_count' | 'watched_count' | 'watch_parts_total' | 'watch_parts_done'>) {
  if (isSplitVideo(item)) return item.watch_parts_done === item.watch_parts_total ? 1 : 0
  return item.watched_count || 0
}
export function videoPartLabel(item: Pick<VideoWatchState, 'watch_parts_total' | 'watch_parts_done'>) {
  return `${item.watch_parts_done || 0}/${item.watch_parts_total || 1}`
}
