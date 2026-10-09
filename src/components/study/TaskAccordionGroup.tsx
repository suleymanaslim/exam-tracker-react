import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface Props { title: string; count: number; icon: ReactNode; children: ReactNode }

export default function TaskAccordionGroup({ title, count, icon, children }: Props) {
  const id = useId()
  const [expanded, setExpanded] = useState(true)
  const open = count > 0 && expanded
  return <section className={`study-task-group ${count === 0 ? 'is-empty' : ''}`}>
    <h3>
      <button type="button" className="flex min-h-11 w-full items-center gap-2 px-2 text-left text-xs font-semibold transition-colors duration-200" aria-expanded={open} aria-controls={id} disabled={count === 0} onClick={() => setExpanded(value => !value)}>
        {icon}<span className="flex-1">{title}</span><span className="text-[11px] font-normal tabular-nums text-[var(--study-muted)]">{count}</span>
        <ChevronDown size={13} className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
      </button>
    </h3>
    <div id={id} aria-hidden={!open} inert={!open} className={`study-task-collapse ${open ? 'is-open' : ''}`}><div className="min-h-0 overflow-hidden"><div className="space-y-0.5 pb-3">{children}</div></div></div>
  </section>
}
