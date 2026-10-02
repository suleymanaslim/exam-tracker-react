export function playlistURL(value?: string | null): string | null {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export const FOCUS_VIDEO_IDS = ['UkgjD7TQoj4', 'JDLtgxIDKAE', 'Wm4h-F1Uc2A', 'wdjpworLSk8', 'mcGa4SDTeyc']
export function nextFocusVideo(previous: string | null, random = Math.random) {
  const choices = FOCUS_VIDEO_IDS.filter(id => id !== previous)
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]
}
