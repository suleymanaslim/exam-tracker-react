import { localDayKey, mondayOf, weekBounds } from './statsPeriod.ts'
export interface StudyRecord { id: string; subject_id: string | null; duration_minutes: number; started_at: string }
export function minutesLabel(value: number) { const minutes = Math.round(value); return minutes >= 60 ? `${Math.floor(minutes / 60)} sa${minutes % 60 ? ` ${minutes % 60} dk` : ''}` : `${minutes} dk` }
export function analyzeStudy(records: StudyRecord[], week: string | null, now = new Date()) {
  const valid = records.filter(r => Number.isFinite(r.duration_minutes) && r.duration_minutes > 0 && !Number.isNaN(new Date(r.started_at).getTime()) && new Date(r.started_at) <= now)
  const bounds = week ? weekBounds(week) : null
  const selected = valid.filter(r => !bounds || (new Date(r.started_at) >= bounds.start && new Date(r.started_at) < bounds.end))
  const total = selected.reduce((sum, r) => sum + r.duration_minutes, 0)
  const active = new Set(selected.map(r => localDayKey(new Date(r.started_at)))).size
  const first = bounds?.start ?? (selected.length ? new Date(Math.min(...selected.map(r => new Date(r.started_at).getTime()))) : now)
  const last = bounds ? new Date(Math.min(now.getTime(), bounds.end.getTime() - 1)) : now
  // Calendar arithmetic is independent of daylight-saving changes.
  const ordinal = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000
  const days = Math.max(0, ordinal(last) - ordinal(first) + 1)
  const buckets = Array.from({ length: week ? 7 : 12 }, (_, i) => {
    const start = week ? new Date(bounds!.start) : mondayOf(now)
    start.setDate(start.getDate() + (week ? i : (i - 11) * 7))
    const end = new Date(start); end.setDate(end.getDate() + (week ? 1 : 7))
    return { key: localDayKey(start), label: start.toLocaleDateString('tr-TR', week ? { weekday: 'short' } : { day: 'numeric', month: 'short' }), minutes: selected.filter(r => new Date(r.started_at) >= start && new Date(r.started_at) < end).reduce((sum, r) => sum + r.duration_minutes, 0) }
  })
  const bySubject = new Map<string, { id: string; minutes: number; count: number }>()
  const timeOfDay = [0, 0, 0, 0]
  for (const r of selected) {
    const id = r.subject_id || 'unassigned'
    const subject = bySubject.get(id) ?? { id, minutes: 0, count: 0 }
    subject.minutes += r.duration_minutes; subject.count++; bySubject.set(id, subject)
    timeOfDay[Math.floor(new Date(r.started_at).getHours() / 6)] += r.duration_minutes
  }
  let previous: number | null = null
  if (bounds) {
    const start = new Date(bounds.start); start.setDate(start.getDate() - 7)
    const end = new Date(start); end.setDate(end.getDate() + days)
    // Compare the same elapsed weekdays for a current, incomplete week.
    const sameWeekdays = new Date(bounds.start); sameWeekdays.setDate(sameWeekdays.getDate() + days)
    previous = valid.filter(r => new Date(r.started_at) >= start && new Date(r.started_at) < end).reduce((sum, r) => sum + r.duration_minutes, 0)
    const comparableTotal = selected.filter(r => new Date(r.started_at) < sameWeekdays).reduce((sum, r) => sum + r.duration_minutes, 0)
    if (comparableTotal !== total) previous = null
  }
  return { selected, total, active, days, dailyAverage: days ? total / days : 0, sessionAverage: selected.length ? total / selected.length : 0, buckets, bySubject: [...bySubject.values()].sort((a, b) => b.minutes - a.minutes), timeOfDay, previous }
}
