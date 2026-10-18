import { Check, Pencil, Plus, Trash2, Video } from 'lucide-react'
import type { QuestionPlan } from '../lib/questionPlan'
import { dailyQuestionTargets } from '../lib/questionWeek'

interface Props {
  week: string; today: string; selectedDate: string; plans: QuestionPlan[];
  onSelectDate: (date: string) => void; onAdd: (date: string) => void;
  onEdit: (plan: QuestionPlan) => void; onSolved: (plan: QuestionPlan) => void; onRemove: (plan: QuestionPlan) => void;
}
export default function QuestionWeekBoard({ week, today, selectedDate, plans, onSelectDate, onAdd, onEdit, onSolved, onRemove }: Props) {
  const days = dailyQuestionTargets(plans, week)
  return <>
    <nav className="question-day-nav" aria-label="Haftanın günleri">{days.map(day => <button type="button" key={day.date} aria-pressed={selectedDate === day.date} aria-current={day.date === today ? 'date' : undefined} onClick={() => onSelectDate(day.date)}><span>{day.short}</span><strong>{day.day}</strong><small>{day.plans.reduce((sum, plan) => sum + (plan.target_questions || 0), 0)} soru</small></button>)}</nav>
    <div className="question-week-board">{days.map(day => <section key={day.date} className={`question-day ${day.date === selectedDate ? 'is-selected' : ''} ${day.date === today ? 'is-today' : ''}`} aria-label={`${day.label} soru planı`}>
      <header><div><h2>{day.label}</h2><span>{day.plans.length} görev</span></div><button type="button" className="question-icon-button" aria-label={`${day.label} gününe soru hedefi ekle`} onClick={() => onAdd(day.date)}><Plus size={16} /></button></header>
      <div className="question-day-tasks">{day.plans.map(plan => {
        const done = plan.solved_questions >= plan.target_questions!
        return <article key={plan.id} className={`question-day-task ${done ? 'is-done' : ''}`}>
          <button type="button" className="question-task-main" onClick={() => onEdit(plan)} aria-label={`${plan.subjects?.name || 'Ders'} ${plan.target_questions} soruluk hedefi düzenle`}><span className="question-task-kind">{plan.video_plan_item_id ? <><Video size={12} /> Videodan</> : 'Soru görevi'}</span><strong>{plan.subjects?.name || 'Ders kaldırıldı'}</strong><span className="question-task-target">{plan.target_questions}<small>soru</small>{done && <Check size={22} aria-label="Tamamlandı" />}</span><span className="question-task-progress">{plan.solved_questions} çözüldü{plan.resources?.name ? ` · ${plan.resources.name}` : ''}</span></button>
          <footer><button type="button" onClick={() => onSolved(plan)}><Plus size={13} /> Çözülen ekle</button><button type="button" aria-label="Hedefi düzenle" onClick={() => onEdit(plan)}><Pencil size={13} /></button><button type="button" aria-label="Hedefi sil" onClick={() => onRemove(plan)}><Trash2 size={13} /></button></footer>
        </article>
      })}{!day.plans.length && <button type="button" className="question-day-empty" onClick={() => onAdd(day.date)}><Plus size={16} /><span>Güne hedef ekle</span></button>}</div>
    </section>)}</div>
  </>
}
