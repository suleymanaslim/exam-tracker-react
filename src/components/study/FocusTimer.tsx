import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'

interface Props {
  subject: string
  playlist: string | null
  seconds: number
  countUp: boolean
  isBreak: boolean
  active: boolean
  running: boolean
  detail: string
  videoCount?: number | null
  progress: number
  children: ReactNode
}

export default function FocusTimer({ subject, playlist, seconds, countUp, isBreak, active, running, detail, videoCount, progress, children }: Props) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  const clock = countUp || hours > 0
    ? [hours, minutes, seconds % 60]
    : [Math.floor(seconds / 60), seconds % 60]
  return <div className={`study-focus-timer flex min-w-0 flex-1 flex-col items-center justify-center text-center ${active ? 'is-active' : ''}`}>
    <div className="mb-7 flex min-h-16 flex-col items-center justify-center gap-2 px-4">
      <h2 className="max-w-full text-xl font-medium tracking-tight [overflow-wrap:anywhere]">{isBreak ? 'Mola zamanı' : subject || 'Neye odaklanacaksın?'}</h2>
      {!isBreak && playlist && <a href={playlist} target="_blank" rel="noopener noreferrer" className="study-quiet-link inline-flex min-h-7 items-center gap-1.5 rounded text-xs">Oynatma listesi <ExternalLink size={12} /></a>}
      {!active && !isBreak && videoCount != null && <span className="study-video-target flex items-baseline gap-1.5 text-[var(--study-accent)]"><strong className="text-3xl font-semibold tabular-nums">{videoCount}</strong><span className="text-sm font-medium">video</span></span>}
      {!active && detail && <span className="text-xs text-[var(--study-muted)]">{detail}</span>}
      {active && !running && <span className="text-xs text-[var(--study-muted)]" role="status">Duraklatıldı</span>}
    </div>
    <div className={`study-zen-clock font-normal tabular-nums ${clock.length === 3 ? 'has-hours' : ''}`} role="timer" aria-label={isBreak ? 'Mola için kalan süre' : countUp ? 'Çalışılan süre' : 'Kalan süre'}>
      {clock.map((part, index) => <span key={index}>{index > 0 && <span className="study-clock-colon">:</span>}{String(part).padStart(2, '0')}</span>)}
    </div>
    <div className={`mb-9 mt-5 h-0.5 w-36 overflow-hidden rounded-full ${countUp ? '' : 'bg-[var(--study-soft)]'}`}>
      {!countUp && <div className="h-full rounded-full bg-[var(--study-accent)] transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} role="progressbar" aria-label="Oturum ilerlemesi" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} />}
    </div>
    {children}
  </div>
}
