import { Check, Pause, Play, RotateCcw, SkipForward } from 'lucide-react'

interface Props {
  running: boolean
  started: boolean
  isBreak: boolean
  disabled: boolean
  saving: boolean
  onToggle: () => void
  onFinish: () => void
  onReset: () => void
  onSkipBreak: () => void
}

export default function TimerControls({ running, started, isBreak, disabled, saving, onToggle, onFinish, onReset, onSkipBreak }: Props) {
  const primary = useRef<HTMLButtonElement>(null)
  const active = started || isBreak
  useEffect(() => { if (active) primary.current?.focus({ preventScroll: true }) }, [active])
  return <div className="flex flex-col items-center gap-3">
    <button ref={primary} type="button" className="study-button study-button-primary min-w-40 px-7" onClick={onToggle} disabled={disabled}>
      {running ? <Pause size={16} /> : <Play size={16} />}{saving ? 'Kaydediliyor…' : running ? 'Duraklat' : started || isBreak ? 'Devam et' : 'Başlat'}
    </button>
    <div className="flex min-h-9 items-center justify-center gap-3">
      {isBreak ? <button type="button" className="study-utility" onClick={onSkipBreak} disabled={disabled}><SkipForward size={14} /> Molayı atla</button> : started && <>
        <button type="button" className="study-utility" onClick={onFinish} disabled={disabled}><Check size={14} /> Bitir ve kaydet</button>
        {!running && <button type="button" className="study-utility" onClick={onReset} disabled={disabled}><RotateCcw size={13} /> Sıfırla</button>}
      </>}
    </div>
  </div>
}
import { useEffect, useRef } from 'react'
