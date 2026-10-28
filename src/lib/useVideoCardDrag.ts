import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { CalendarVideo } from '../components/VideoWeekCalendar'

interface DragItem { id: string; date: string; completion_week?: string | null }
interface ActiveDrag<T> { item: T; pointer: number; element: HTMLElement; startX: number; startY: number; x: number; y: number; moved: boolean }
interface DragPreview<T> { item: T; x: number; y: number; target: string | null }

export function useCalendarCardDrag<T extends DragItem>(onMove: (item: T, date: string) => Promise<boolean>, onMoved: (date: string) => void,
  { dropAttribute = 'data-video-drop-date', cardAttribute = 'data-video-id', handleSelector = '.video-card-drag-handle', scrollSelector = '.video-week-scroll' } = {}) {
  const active = useRef<ActiveDrag<T> | null>(null)
  const frame = useRef(0)
  const mounted = useRef(true)
  const suppressClick = useRef(false)
  const [preview, setPreview] = useState<DragPreview<T> | null>(null)
  const [moving, setMoving] = useState(false)
  const pending = useRef(false)
  const dropDate = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>(`[${dropAttribute}]`)?.getAttribute(dropAttribute) || null
  const cancel = useCallback(() => {
    cancelAnimationFrame(frame.current)
    const drag = active.current; active.current = null
    if (drag?.element.hasPointerCapture(drag.pointer)) drag.element.releasePointerCapture(drag.pointer)
    setPreview(null)
    setTimeout(() => { suppressClick.current = false }, 0)
  }, [])
  useEffect(() => {
    mounted.current = true
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    window.addEventListener('keydown', escape); window.addEventListener('blur', cancel)
    return () => { mounted.current = false; cancelAnimationFrame(frame.current); active.current = null; window.removeEventListener('keydown', escape); window.removeEventListener('blur', cancel) }
  }, [cancel])
  const tick = () => {
    const drag = active.current
    if (!drag?.moved) return
    const scroller = drag.element.closest(scrollSelector)
    if (scroller) {
      const box = scroller.getBoundingClientRect()
      if (drag.y >= box.top && drag.y <= box.bottom && drag.x >= box.left && drag.x <= box.right) {
        scroller.scrollLeft += drag.x > box.right - 40 ? 12 : drag.x < box.left + 40 ? -12 : 0
      }
    }
    const target = dropDate(drag.x, drag.y)
    setPreview(previous => previous?.x === drag.x && previous.y === drag.y && previous.target === target ? previous : { item: drag.item, x: drag.x, y: drag.y, target })
    frame.current = requestAnimationFrame(tick)
  }
  const start = (event: PointerEvent<HTMLElement>, item: T) => {
    if (pending.current || active.current || item.completion_week || !event.isPrimary || event.button !== 0) return
    active.current = { item, element: event.currentTarget, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLElement>) => {
    const drag = active.current
    if (!drag || drag.pointer !== event.pointerId) return
    drag.x = event.clientX; drag.y = event.clientY
    if (!drag.moved && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 8) {
      drag.moved = true; suppressClick.current = true; tick()
    }
    if (drag.moved) event.preventDefault()
  }
  const saveMove = async (item: T, date: string, restoreFocus = false) => {
    if (pending.current || item.completion_week || date === item.date) return
    pending.current = true; setMoving(true)
    try {
      if (await onMove(item, date) && mounted.current) {
        onMoved(date)
        if (restoreFocus) requestAnimationFrame(() => {
          if (!mounted.current) return
          const card = [...document.querySelectorAll<HTMLElement>(`[${cardAttribute}]`)].find(value => value.getAttribute(cardAttribute) === item.id)
          card?.querySelector<HTMLButtonElement>(handleSelector)?.focus({ preventScroll: false })
        })
      }
    }
    finally { pending.current = false; if (mounted.current) setMoving(false) }
  }
  const end = (event: PointerEvent<HTMLElement>) => {
    const drag = active.current
    if (!drag || drag.pointer !== event.pointerId) return
    const target = drag.moved ? dropDate(event.clientX, event.clientY) : null
    cancel()
    if (drag.moved) event.preventDefault()
    if (target) void saveMove(drag.item, target)
  }
  return { preview, moving, start, move, end, cancel, saveMove, consumeClick: () => { const blocked = suppressClick.current; suppressClick.current = false; return blocked } }
}

export function useVideoCardDrag(onMove: (item: CalendarVideo, date: string) => Promise<boolean>, onMoved: (date: string) => void) {
  return useCalendarCardDrag(onMove, onMoved)
}
