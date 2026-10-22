import { isSplitVideo, watchedVideos } from './videoWatch.ts'
import type { VideoWatchState } from './videoWatch.ts'

const normalized = (value: string) => value.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const withoutPrefix = (value: string) => value.replace(/^(?:MEB[\s-]*)?AGS[\s·:–-]*/i, '').trim()

/** Display aliases only: stored subject/resource names are never rewritten. */
export function videoCardNames(subjectName: string, resourceName: string) {
  const subject = withoutPrefix(subjectName) || 'Video'
  const key = normalized(subject)
  let label = subject
  if (/türkiye coğrafyası|coğrafya/.test(key)) label = 'Coğrafya'
  else if (/eğitim bilimleri|türk mill[iî] eğitim|eğitimin temelleri/.test(key)) label = 'Eğitim Bilimleri'
  else if (key === 'sözel yetenek') label = 'Sözel'
  else if (key === 'sayısal yetenek') label = 'Sayısal'

  let resource = withoutPrefix(resourceName)
  if (normalized(resource).startsWith(key) && subject !== 'Video') {
    // Remove only a complete leading subject name, never part of another word.
    const words = subject.split(/\s+/).filter(Boolean)
    const escaped = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
    resource = resource.replace(new RegExp(`^${escaped}(?=$|[\\s·:–-])`, 'i'), '').replace(/^[\s·:–-]+/, '')
  }
  resource = resource.replace(/(?:^|\s)Video\s+Ders\s+Notları(?=$|\s)/gi, '').replace(/(?:^|\s)Video\s+Ders(?:leri|i)?(?=$|\s)/gi, '').trim()
  if (/^(video|ders|dersler|ders notları|notlar|notları|videolar|video ders notları)$/i.test(resource)) resource = ''
  if (normalized(resource) === normalized(subject) || normalized(resource) === normalized(label)) resource = ''
  return { label, resource }
}

export function videoWatchLabel(item: VideoWatchState) {
  if (item.completion_week) return '1 video kaydedildi'
  if (isSplitVideo(item)) return `${item.watch_parts_done || 0}/${item.watch_parts_total} parça tamamlandı`
  const watched = watchedVideos(item)
  return watched > 0 ? `${watched} video izlendi` : 'Planlandı'
}
