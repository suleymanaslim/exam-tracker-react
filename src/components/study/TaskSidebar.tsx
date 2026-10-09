import { BookOpen, BookOpenCheck, Check, Clock3, ExternalLink, Video } from 'lucide-react'
import { Link } from 'react-router-dom'
import TaskAccordionGroup from './TaskAccordionGroup'
import type { TaskRow } from './types'

interface Props {
  tasks: TaskRow[]
  questions: TaskRow[]
  selectedId: string | null
  todayDuration: string
  busy: boolean
  error: string
  onSelectTask: (id: string) => void
  onSelectQuestion: (id: string) => void
}

function TaskButton({ task, selected, onClick }: { task: TaskRow; selected: boolean; onClick: () => void }) {
  const Icon = task.kind === 'questions' ? BookOpenCheck : task.kind === 'video' ? Video : BookOpen
  return <button type="button" disabled={task.disabled} aria-pressed={selected} onClick={onClick} className={`study-task-row group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors duration-200 ${selected ? 'is-selected' : ''} ${task.kind === 'questions' ? 'is-question' : ''}`}>
    <Icon size={16} className="mt-0.5 shrink-0 study-task-icon" />
    <span className="min-w-0 flex-1">
      <span className="flex items-start justify-between gap-2"><span className="text-[13px] font-medium leading-5">{task.name}</span>{task.done && <Check size={13} className="mt-1 shrink-0 text-[var(--study-muted)]" aria-label="Hedef tamamlandı" />}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-4 text-[var(--study-muted)]">
        <span>{task.detail}</span><span className="font-mono text-[10px] tabular-nums" title="Bu derste bugün, tüm kaynaklarda çalışılan süre">Bugün {task.todayMinutes} dk</span>
      </span>
    </span>
  </button>
}

export default function TaskSidebar({ tasks, questions, selectedId, todayDuration, busy, error, onSelectTask, onSelectQuestion }: Props) {
  return <aside className="study-task-sidebar" aria-label="Bugünün planı" aria-hidden={busy} inert={busy}>
    <div className="study-sidebar-inner flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-5 pt-5">
        <h2 className="text-sm font-semibold tracking-tight">Bugünün planı</h2>
        <Link to="/plan" className="study-quiet-link rounded-md p-2" aria-label="Haftalık planı düzenle" title="Planı düzenle"><ExternalLink size={14} /></Link>
      </div>
      <div className="mx-5 mb-4 mt-3 flex items-center justify-between gap-3 border-b border-[var(--study-line)] pb-4">
        <span className="flex items-center gap-1.5 text-xs text-[var(--study-muted)]"><Clock3 size={13} /> Bugün çalışılan</span>
        <strong className="whitespace-nowrap font-mono text-xs font-medium tabular-nums">{todayDuration}</strong>
      </div>
      <div className="study-task-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
        <TaskAccordionGroup title="Video görevleri" count={tasks.length} icon={<Video size={14} />}>
          {tasks.map(task => <TaskButton key={task.id} task={task} selected={selectedId === task.id} onClick={() => onSelectTask(task.id)} />)}
        </TaskAccordionGroup>
        <TaskAccordionGroup title="Soru görevleri" count={questions.length} icon={<BookOpenCheck size={14} />}>
          {questions.map(task => <TaskButton key={task.id} task={task} selected={selectedId === task.id} onClick={() => onSelectQuestion(task.id)} />)}
        </TaskAccordionGroup>
        {tasks.length === 0 && questions.length === 0 && !error && <p className="px-2 pt-2 text-xs leading-5 text-[var(--study-muted)]">Bugün için planlanmış görev yok.</p>}
        {error && <p className="px-2 pt-2 text-xs leading-5 text-[var(--study-muted)]" role="status">{error}</p>}
      </div>
    </div>
  </aside>
}
