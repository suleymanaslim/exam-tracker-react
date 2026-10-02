export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function mondayOf(date: Date): Date {
  const monday = new Date(date)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7)
  return monday
}

export function weekBounds(day: string): { start: Date; end: Date } {
  const start = mondayOf(new Date(`${day}T00:00:00`))
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

export function sessionsInWeek<T extends { started_at: string }>(sessions: T[], day: string): T[] {
  const { start, end } = weekBounds(day)
  return sessions.filter(session => {
    const date = new Date(session.started_at)
    return date >= start && date < end
  })
}

export function studyTrend(sessions: { started_at: string; duration_minutes: number }[], week: string | null) {
  const buckets = new Map<string, { label: string; minutes: number }>()
  if (week) {
    const { start } = weekBounds(week)
    for (let i = 0; i < 7; i++) {
      const date = new Date(start)
      date.setDate(date.getDate() + i)
      buckets.set(localDayKey(date), { label: date.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' }), minutes: 0 })
    }
  }
  for (const session of sessions) {
    const date = new Date(session.started_at)
    if (Number.isNaN(date.getTime())) continue
    const bucketDate = week ? date : mondayOf(date)
    const key = localDayKey(bucketDate)
    if (!buckets.has(key)) {
      buckets.set(key, { label: bucketDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }), minutes: 0 })
    }
    buckets.get(key)!.minutes += session.duration_minutes || 0
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value)
}
