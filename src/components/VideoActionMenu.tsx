import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'

interface Action { label: string; icon: ReactNode; onSelect: () => void; disabled?: boolean; danger?: boolean }
interface Props { label: string; actions: Action[]; children?: ReactNode; className?: string }

/** The portal keeps menus clear of the calendar's horizontal scroll clipping. */
export default function VideoActionMenu({ label, actions, children, className = '' }: Props) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const close = useCallback((restore = false) => { setPosition(null); if (restore) trigger.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    if (!position) return
    const anchor = trigger.current?.getBoundingClientRect()
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close()
    }
    const dismiss = () => close()
    const scroll = () => {
      const current = trigger.current?.getBoundingClientRect()
      // A browser may deliver the click's earlier scroll event after opening.
      if (!current || !anchor || Math.abs(current.top - anchor.top) > 1 || Math.abs(current.left - anchor.left) > 1) close()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(true) } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', scroll, true)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', scroll, true) }
  }, [position, close])

  return <span className="video-action-control" data-print-remove>
    <button ref={trigger} type="button" className={`video-menu-trigger ${className}`} aria-label={label} aria-haspopup="menu" aria-expanded={!!position} aria-controls={position ? id : undefined}
      onDragStart={event => event.preventDefault()} onClick={event => {
        event.stopPropagation()
        if (position) { close(); return }
        const rect = event.currentTarget.getBoundingClientRect(), height = actions.length * 42 + 12
        setPosition({ left: Math.max(8, Math.min(window.innerWidth - 216, rect.right - 208)), top: rect.bottom + height + 6 < window.innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - height - 6) })
      }}>{children || <MoreHorizontal size={18} aria-hidden="true" />}</button>
    {position && createPortal(<div ref={menu} id={id} role="menu" aria-label={label} className="video-action-menu" style={position}
      onKeyDown={event => {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
          buttons[next]?.focus()
        } else if (event.key === 'Tab') close(true)
      }}>
      {actions.map(action => <button key={action.label} type="button" role="menuitem" disabled={action.disabled} className={action.danger ? 'is-danger' : ''} onClick={event => { event.stopPropagation(); close(true); action.onSelect() }}>{action.icon}<span>{action.label}</span></button>)}
    </div>, document.body)}
  </span>
}
