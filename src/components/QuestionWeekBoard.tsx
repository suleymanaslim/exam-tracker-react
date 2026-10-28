import { Check, Copy, GripVertical, Pencil, Plus, Trash2, Video } from 'lucide-react'
import type { QuestionPlan } from '../lib/questionPlan'
import { dailyQuestionTargets } from '../lib/questionWeek'
import { useCalendarCardDrag } from '../lib/useVideoCardDrag'

interface Props {
  week: string; today: string; selectedDate: string; plans: QuestionPlan[];
  clipboardId: string | null; busy: boolean;
  onCopy: (plan: QuestionPlan) => void; onPaste: (date: string) => void;
  onMove: (plan: QuestionPlan, date: string) => Promise<boolean>;
  onSelectDate: (date: string) => void; onAdd: (date: string) => void;
  onEdit: (plan: QuestionPlan) => void; onSolved: (plan: QuestionPlan) => void; onRemove: (plan: QuestionPlan) => void;
}
export default function QuestionWeekBoard({ week, today, selectedDate, plans, clipboardId, busy, onCopy, onPaste, onMove, onSelectDate, onAdd, onEdit, onSolved, onRemove }: Props) {
  const days = dailyQuestionTargets(plans, week)
  const drag = useCalendarCardDrag(onMove, onSelectDate, { dropAttribute: 'data-question-drop-date', cardAttribute: 'data-question-id', handleSelector: '.question-drag-handle', scrollSelector: '.question-week-board' })
  const chooseDay = (date: string) => { if (!busy) { if (clipboardId) onPaste(date); else onSelectDate(date) } }
  const addToDay = (date: string) => { if (!busy) { if (clipboardId) onPaste(date); else onAdd(date) } }
  return <div className={`question-board-content ${clipboardId ? 'is-copying' : ''}`} onClickCapture={event => { if (drag.consumeClick()) { event.preventDefault(); event.stopPropagation() } }}>
    <nav className="question-day-nav" aria-label="Haftanın günleri">{days.map(day => <button type="button" key={day.date} data-question-drop-date={day.date} disabled={busy} className={drag.preview?.target === day.date ? 'is-transfer-target' : ''} aria-label={clipboardId ? `${day.label} gününe yapıştır` : undefined} aria-pressed={selectedDate === day.date} aria-current={day.date === today ? 'date' : undefined} onClick={() => chooseDay(day.date)}><span>{day.short}</span><strong>{day.day}</strong><small>{day.plans.reduce((sum, plan) => sum + (plan.target_questions || 0), 0)} soru</small></button>)}</nav>
    <div className="question-week-board">{days.map((day, dayIndex) => <section key={day.date} data-question-drop-date={day.date} onClick={() => { if (clipboardId && !busy) onPaste(day.date) }} className={`question-day ${day.date === selectedDate ? 'is-selected' : ''} ${day.date === today ? 'is-today' : ''} ${drag.preview?.target === day.date ? 'is-transfer-target' : ''}`} aria-label={`${day.label} soru planı`}>
      <header><div><h2>{day.label}</h2><span>{day.plans.length} görev</span></div><button type="button" disabled={busy} className="question-icon-button" aria-label={`${day.label} gününe ${clipboardId ? 'yapıştır' : 'soru hedefi ekle'}`} onClick={event => { event.stopPropagation(); addToDay(day.date) }}><Plus size={16} /></button></header>
      <div className="question-day-tasks">{day.plans.map(plan => {
        const done = plan.solved_questions >= plan.target_questions!
        return <article key={plan.id} data-question-id={plan.id} className={`question-day-task ${done ? 'is-done' : ''} ${clipboardId === plan.id ? 'is-copy-source' : ''} ${drag.preview?.item.id === plan.id ? 'is-drag-source' : ''}`} onClick={event => event.stopPropagation()}>
          <button type="button" disabled={busy || drag.moving} className="question-task-main" onPointerDown={event => { if (!clipboardId && !busy) drag.start(event, plan) }} onPointerMove={drag.move} onPointerUp={drag.end} onPointerCancel={drag.cancel} onLostPointerCapture={drag.cancel} onClick={() => clipboardId ? onPaste(day.date) : onEdit(plan)} aria-label={`${plan.subjects?.name || 'Ders'} ${plan.target_questions} soruluk hedefi düzenle`}><span className="question-task-kind">{plan.video_plan_item_id ? <><Video size={12} /> Videodan</> : 'Soru görevi'}</span><strong>{plan.subjects?.name || 'Ders kaldırıldı'}</strong>{plan.note && <span className="question-plan-note">{plan.note}</span>}<span className="question-task-target">{plan.target_questions}<small>soru</small>{done && <Check size={22} aria-label="Tamamlandı" />}</span><span className="question-task-progress">{plan.solved_questions} çözüldü{plan.resources?.name ? ` · ${plan.resources.name}` : ''}</span></button>
          <footer><button type="button" disabled={busy} onClick={() => onSolved(plan)}><Plus size={13} /> Çözülen ekle</button>
            <button type="button" className="question-drag-handle" disabled={busy || drag.moving || !!clipboardId} aria-label="Hedefi başka güne taşı" title="Tut ve sürükle · sol/sağ ok tuşlarıyla taşı" onPointerDown={event => drag.start(event, plan)} onPointerMove={drag.move} onPointerUp={drag.end} onPointerCancel={drag.cancel} onLostPointerCapture={drag.cancel} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const date = days[dayIndex + (event.key === 'ArrowLeft' ? -1 : 1)]?.date; if (date) void drag.saveMove(plan, date, true) } }}><GripVertical size={14} /></button>
            <button type="button" disabled={busy} aria-label="Hedefi kopyala" title="Kopyala, ardından hedef güne tıkla" onClick={() => onCopy(plan)}><Copy size={14} /></button><button type="button" disabled={busy} aria-label="Hedefi düzenle" onClick={() => onEdit(plan)}><Pencil size={13} /></button><button type="button" disabled={busy} aria-label="Hedefi sil" onClick={() => onRemove(plan)}><Trash2 size={13} /></button></footer>
        </article>
      })}{!day.plans.length && <button type="button" disabled={busy} className="question-day-empty" onClick={event => { event.stopPropagation(); addToDay(day.date) }}><Plus size={16} /><span>{clipboardId ? 'Buraya yapıştır' : 'Güne hedef ekle'}</span></button>}</div>
    </section>)}</div>
    {drag.preview && <div className="question-drag-preview" aria-hidden="true" style={{ left: drag.preview.x + 10, top: drag.preview.y + 10 }}>{drag.preview.item.note || drag.preview.item.subjects?.name}<small>{drag.preview.item.target_questions} soru</small></div>}
  </div>
}
