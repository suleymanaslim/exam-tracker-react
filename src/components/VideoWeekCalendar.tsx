import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, GripVertical, Plus, SkipForward, Trash2 } from 'lucide-react'
import { useVideoCardDrag } from '../lib/useVideoCardDrag'
import VideoActionMenu from './VideoActionMenu'
import { isSplitVideo, videoDisplayDate, watchedVideos } from '../lib/videoWatch'
import type { VideoWatchState } from '../lib/videoWatch'
import { videoCardNames, videoWatchLabel } from '../lib/videoPresentation'

export interface CalendarVideo extends VideoWatchState { resource_id: string; sort_order?: number }
interface Resource { id: string; name: string; subject_id: string; subject_name?: string; avg_video_duration: number; resource_type: string; total_videos: number }
interface Props {
  selectedDay: number; onSelectDay: (day: number) => void
  days: Date[]; items: CalendarVideo[]; resources: Resource[]
  color: (subjectId: string) => { dot: string; text: string }
  onAdd: (date: Date) => void
  onProgress: (item: CalendarVideo, resource?: Resource) => void
  onDelete: (id: string) => void
  onReorder: (item: CalendarVideo, direction: -1 | 1) => void
  onClear: (date: string) => void
  onShift: (date: string) => void
  onCompleteDay: (items: CalendarVideo[]) => void
  onMove: (item: CalendarVideo, date: string) => Promise<boolean>
  onSwap: (from: string, to: string) => void
}
const shortDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const longDays = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
function dayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function minutes(value: number) {
  const total = Math.max(0, Math.round(value)), hours = Math.floor(total / 60), rest = total % 60
  return hours ? `${hours} sa${rest ? ` ${rest} dk` : ''}` : `${rest} dk`
}

export default function VideoWeekCalendar({ selectedDay, onSelectDay, days, items, resources, color, onAdd, onProgress, onDelete, onReorder, onClear, onShift, onCompleteDay, onSwap, onMove }: Props) {
  const [today] = useState(() => dayKey(new Date()))
  const [dragSource, setDragSource] = useState<string | null>(null)
  const [dragTarget, setDragTarget] = useState<string | null>(null)
  const resourcesById = useMemo(() => new Map(resources.map(resource => [resource.id, resource])), [resources])
  const week = useMemo(() => days.map(date => {
    const key = dayKey(date)
    const plans = items.filter(item => videoDisplayDate(item) === key).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id.localeCompare(b.id))
    return { date, key, plans, count: plans.reduce((sum, item) => sum + item.video_count, 0), watched: plans.reduce((sum, item) => sum + watchedVideos(item), 0), minutes: plans.reduce((sum, item) => sum + item.video_count * (resourcesById.get(item.resource_id)?.avg_video_duration || 0), 0) }
  }), [days, items, resourcesById])
  const cardDrag = useVideoCardDrag(onMove, date => { const index = week.findIndex(day => day.key === date); if (index >= 0) onSelectDay(index) })
  const total = week.reduce((sum, day) => ({ count: sum.count + day.count, watched: sum.watched + day.watched, minutes: sum.minutes + day.minutes }), { count: 0, watched: 0, minutes: 0 })

  return <div className={`video-calendar ${cardDrag.preview ? 'is-dragging-card' : ''}`} onClickCapture={event => { if (cardDrag.consumeClick()) { event.preventDefault(); event.stopPropagation() } }}>
    <nav className="video-mobile-days" aria-label="Video planı günü" data-print-remove>
      {week.map((day, index) => <button key={day.key} data-video-drop-date={day.key} className={cardDrag.preview?.target === day.key ? 'is-card-drop-target' : undefined} type="button" aria-label={`${longDays[index]} ${day.date.getDate()}`} aria-pressed={selectedDay === index} aria-current={day.key === today ? 'date' : undefined} onClick={() => onSelectDay(index)}><span>{shortDays[index]}</span><strong>{day.date.getDate()}</strong></button>)}
    </nav>
    <div className="video-week-scroll"><div className="video-week-board">
      {week.map((day, index) => {
        const editable = day.plans.filter(item => !item.completion_week)
        const pending = editable.some(item => watchedVideos(item) < item.video_count)
        const actions = [
          ...(pending ? [{ label: 'Tümünü izlendi say', icon: <Check size={15} />, onSelect: () => onCompleteDay(day.plans) }] : []),
          { label: 'Planı 1 gün kaydır', icon: <SkipForward size={15} />, onSelect: () => onShift(day.key) },
          ...(day.plans.length ? [{ label: 'Günü temizle', icon: <Trash2 size={15} />, danger: true, onSelect: () => onClear(day.key) }] : []),
        ]
        return <section key={day.key} data-date={day.key} data-video-drop-date={day.key} aria-label={`${longDays[index]} video planı`} className={`video-day-column ${day.key === today ? 'is-today' : ''} ${index === selectedDay ? 'is-selected' : ''} ${dragTarget === day.key || cardDrag.preview?.target === day.key ? 'is-drag-target' : ''} ${dragSource === day.key ? 'is-drag-source' : ''}`}
          onDragOver={event => { if (dragSource) { event.preventDefault(); if (dragSource !== day.key) setDragTarget(day.key) } }}
          onDragLeave={() => setDragTarget(null)}
          onDrop={event => { event.preventDefault(); const source = event.dataTransfer.getData('text/plain'); setDragTarget(null); setDragSource(null); if (dragSource && source === dragSource && source !== day.key) onSwap(source, day.key) }}>
          <header className="video-day-heading" draggable={!!editable.length} title={editable.length ? 'Günü sürükleyerek başka günle değiştir' : undefined}
            onDragStart={event => { event.dataTransfer.setData('text/plain', day.key); event.dataTransfer.effectAllowed = 'move'; setDragSource(day.key) }}
            onDragEnd={() => { setDragSource(null); setDragTarget(null) }}>
            <span className="video-day-name">{shortDays[index]}</span>
            <div className="video-day-date"><strong>{day.date.getDate()}</strong>{day.key === today && <span>Bugün</span>}</div>
            <p>{day.count ? `${day.count} video · ${minutes(day.minutes)}` : 'Plan yok'}</p>
            <div className="video-day-tools"><VideoActionMenu label={`${longDays[index]} işlemleri`} actions={actions} /></div>
          </header>
          <div className="video-day-body" onClick={() => onAdd(day.date)}>
            <div className="video-day-cards">
              {day.plans.map(item => {
                const resource = resourcesById.get(item.resource_id)
                const names = videoCardNames(resource?.subject_name || '', resource?.name || '')
                const palette = color(resource?.subject_id || item.resource_id)
                const watched = watchedVideos(item), done = watched >= item.video_count
                const progress = isSplitVideo(item) ? (item.watch_parts_done || 0) / item.watch_parts_total! : watched / item.video_count
                const moveIndex = editable.findIndex(value => value.id === item.id)
                const cardActions = [
                  ...(!item.completion_week ? [
                    { label: 'Yukarı taşı', icon: <ArrowUp size={15} />, disabled: moveIndex === 0, onSelect: () => onReorder(item, -1) },
                    { label: 'Aşağı taşı', icon: <ArrowDown size={15} />, disabled: moveIndex === editable.length - 1, onSelect: () => onReorder(item, 1) },
                  ] : []),
                  { label: item.completion_week ? 'İzleme kaydını sil' : 'Planı sil', icon: <Trash2 size={15} />, danger: true, onSelect: () => onDelete(item.id) },
                ]
                return <article key={item.id} data-video-id={item.id} className={`video-plan-card ${done ? 'is-done' : ''} ${item.completion_week ? 'is-locked' : ''} ${cardDrag.preview?.item.id === item.id ? 'is-card-drag-source' : ''}`} onClick={event => event.stopPropagation()}>
                  <button type="button" className="video-card-open" data-print-remove disabled={cardDrag.moving || !!item.completion_week || !resource} onPointerDown={event => cardDrag.start(event, item)} onPointerMove={cardDrag.move} onPointerUp={cardDrag.end} onPointerCancel={cardDrag.cancel} onLostPointerCapture={cardDrag.cancel} aria-label={item.completion_week ? 'Pazartesiye kaydedilen 1 video' : `${resource?.name || names.label} izleme ilerlemesi`} title={item.completion_week ? 'Kaydedildi. Bu kayıt yalnızca silinebilir.' : 'İzleme durumunu güncelle'} onClick={event => { event.stopPropagation(); onProgress(item, resource) }} />
                  {!item.completion_week && <button type="button" className="video-card-drag-handle" data-print-remove aria-label={`${names.label} başka güne taşı`} title="Tut ve sürükle · klavyede sol/sağ ok tuşları" disabled={cardDrag.moving}
                    onPointerDown={event => cardDrag.start(event, item)} onPointerMove={cardDrag.move} onPointerUp={cardDrag.end} onPointerCancel={cardDrag.cancel} onLostPointerCapture={cardDrag.cancel}
                    onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const target = week[index + (event.key === 'ArrowLeft' ? -1 : 1)]; if (target) void cardDrag.saveMove(item, target.key, true) } }}><GripVertical size={16} /></button>}
                  <div className="video-card-heading"><h3 title={resource?.subject_name} style={{ color: palette.text }}><i style={{ background: palette.dot }} />{names.label}</h3><VideoActionMenu label={`${resource?.name || names.label} seçenekleri`} actions={cardActions} /></div>
                  <div className="video-card-source" title={resource?.name}>{names.resource}</div>
                  <div className="video-card-numbers"><strong>{item.video_count} video</strong><span>{minutes(item.video_count * (resource?.avg_video_duration || 0))}</span></div>
                  <div className="video-card-status">{done && <Check size={13} aria-hidden="true" />}<span>{videoWatchLabel(item)}</span></div>
                  <div className="video-card-progress" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} /></div>
                </article>
              })}
            </div>
            <button type="button" className="video-day-add" data-print-remove onClick={event => { event.stopPropagation(); onAdd(day.date) }} aria-label={`${longDays[index]} video ekle`}><Plus size={14} /> Video ekle</button>
          </div>
        </section>
      })}
    </div></div>
    <footer className="video-week-summary"><span>Haftalık <strong>{total.count} video</strong><span className="video-summary-separator">·</span>{minutes(total.minutes)}</span><span><i /> <strong>{total.watched}</strong> video izlendi</span></footer>
    {cardDrag.preview && <div className="video-card-drag-preview" data-print-remove style={{ left: cardDrag.preview.x + 12, top: cardDrag.preview.y + 12 }} aria-hidden="true">{videoCardNames(resourcesById.get(cardDrag.preview.item.resource_id)?.subject_name || '', '').label}<span>{cardDrag.preview.item.video_count} video</span></div>}
    <span className="video-drag-announcement" role="status" aria-live="polite">{cardDrag.moving ? 'Video taşınıyor…' : ''}</span>
  </div>
}
