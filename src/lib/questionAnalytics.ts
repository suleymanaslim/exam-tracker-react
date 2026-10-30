import { localDayKey, mondayOf, weekBounds } from './statsPeriod.ts'
import { withQuestionProgress, type QuestionPlan, type QuestionLog } from './questionPlan.ts'

const weekKey = (date: string) => localDayKey(mondayOf(new Date(`${date}T00:00:00`)))
const logDay = (result: QuestionLog) => localDayKey(new Date(result.created_at))

export function analyzeQuestions(plans: QuestionPlan[], logs: QuestionLog[], week: string | null, today = localDayKey(new Date())) {
  const planById = new Map(plans.map(plan => [plan.id, plan]))
  const active = logs.filter(log => !log.deleted_at && Number.isFinite(Date.parse(log.created_at)))
  const selected = active.filter(log => week === null || weekKey(logDay(log)) === weekKey(week))
  // An explicit weekly subject goal includes daily/video goals for that subject.
  const goals = new Map<string, { subjectId: string; week: string; daily: number; weekly: number | null; scoped: Map<string, number> }>()
  for (const plan of plans) {
    if (plan.archived_at || !plan.target_questions || (week !== null && weekKey(plan.date) !== weekKey(week))) continue
    const subjectId = plan.subject_id || `removed:${plan.id}`
    const key = `${subjectId}:${weekKey(plan.date)}`
    const goal = goals.get(key) || { subjectId, week: weekKey(plan.date), daily: 0, weekly: null, scoped: new Map<string, number>() }
    if (plan.note) goal.scoped.set(plan.id, plan.target_questions)
    else if (plan.period === 'week') goal.weekly = (goal.weekly || 0) + plan.target_questions
    else goal.daily += plan.target_questions
    goals.set(key, goal)
  }
  const bySubject = new Map<string, { id: string; name: string; target: number; solved: number; remaining: number; correct: number; wrong: number; correctRecorded: boolean; wrongRecorded: boolean }>()
  const rowFor = (id: string) => {
    if (!bySubject.has(id)) bySubject.set(id, { id, name: plans.find(p => p.subject_id === id || `removed:${p.id}` === id)?.subjects?.name || 'Ders kaldırıldı', target: 0, solved: 0, remaining: 0, correct: 0, wrong: 0, correctRecorded: false, wrongRecorded: false })
    return bySubject.get(id)!
  }
  const solvedByGoal = new Map<string, number>()
  const unscopedSolved = new Map<string, number>()
  const scopedSolved = new Map<string, number>()
  for (const log of selected) {
    const plan = planById.get(log.question_plan_id)
    const subjectId = plan?.subject_id || `removed:${log.question_plan_id}`
    const row = rowFor(subjectId)
    row.solved += log.solved_questions
    row.correct += log.correct_questions || 0
    row.wrong += log.wrong_questions || 0
    row.correctRecorded ||= log.correct_questions != null
    row.wrongRecorded ||= log.wrong_questions != null
    const key = `${subjectId}:${weekKey(logDay(log))}`
    solvedByGoal.set(key, (solvedByGoal.get(key) || 0) + log.solved_questions)
    if (plan?.note) {
      const scopedKey = `${plan.id}:${weekKey(logDay(log))}`
      scopedSolved.set(scopedKey, (scopedSolved.get(scopedKey) || 0) + log.solved_questions)
    } else unscopedSolved.set(key, (unscopedSolved.get(key) || 0) + log.solved_questions)
  }
  for (const [key, goal] of goals) {
    const row = rowFor(goal.subjectId), target = goal.weekly ?? (goal.daily + [...goal.scoped.values()].reduce((sum, value) => sum + value, 0))
    row.target += target
    row.remaining += goal.weekly !== null
      ? Math.max(0, target - (solvedByGoal.get(key) || 0))
      : Math.max(0, goal.daily - (unscopedSolved.get(key) || 0)) + [...goal.scoped].reduce((sum, [id, count]) => sum + Math.max(0, count - (scopedSolved.get(`${id}:${goal.week}`) || 0)), 0)
  }
  const rows = [...bySubject.values()].sort((a, b) => b.solved - a.solved || b.target - a.target)
  const target = rows.reduce((sum, row) => sum + row.target, 0)
  const remaining = rows.reduce((sum, row) => sum + row.remaining, 0)
  const solved = selected.reduce((sum, log) => sum + log.solved_questions, 0)
  const buckets = new Map<string, { key: string; label: string; solved: number }>()
  if (week) {
    const { start } = weekBounds(week)
    for (let i = 0; i < 7; i++) {
      const date = new Date(start); date.setDate(date.getDate() + i)
      const key = localDayKey(date)
      buckets.set(key, { key, label: date.toLocaleDateString('tr-TR', { weekday: 'short' }), solved: 0 })
    }
  }
  for (const log of selected) {
    const key = week ? logDay(log) : weekKey(logDay(log))
    if (!buckets.has(key)) buckets.set(key, { key, label: new Date(`${key}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), solved: 0 })
    buckets.get(key)!.solved += log.solved_questions
  }
  let previous: number | null = null
  if (week) {
    const { start } = weekBounds(week); start.setDate(start.getDate() - 7)
    const key = localDayKey(start)
    previous = active.filter(log => weekKey(logDay(log)) === key).reduce((sum, log) => sum + log.solved_questions, 0)
  }
  return { target, remaining, solved, allTimeSolved: active.reduce((sum, log) => sum + log.solved_questions, 0), progress: target ? Math.round((target - remaining) / target * 100) : null,
    today: active.filter(log => logDay(log) === today).reduce((sum, log) => sum + log.solved_questions, 0),
    bySubject: rows, selected, previous,
    buckets: [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(week ? 0 : -12),
  }
}

export function withWeeklyQuestionProgress(plans: QuestionPlan[], logs: QuestionLog[], carryBefore?: string): QuestionPlan[] {
  const planById = new Map(plans.map(plan => [plan.id, plan]))
  const weekly = plans.filter(plan => plan.period === 'week' && !plan.note)
  const keyFor = (subject: string | null, date: string) => `${subject}:${weekKey(date)}`
  const grouped = logs.filter(log => planById.get(log.question_plan_id)?.subject_id != null
    && Number.isFinite(Date.parse(log.created_at))).map(log => ({ ...log,
      question_plan_id: keyFor(planById.get(log.question_plan_id)!.subject_id, logDay(log)) }))
  // Study can resume an old weekly goal. Count only solutions explicitly saved
  // to that goal after its original week; reporting keeps its calendar boundaries.
  if (carryBefore) for (const log of logs) {
    const plan = planById.get(log.question_plan_id)
    if (plan?.period === 'week' && !plan.note && plan.subject_id && plan.date < carryBefore
      && Number.isFinite(Date.parse(log.created_at)) && weekKey(logDay(log)) !== weekKey(plan.date)) {
      grouped.push({ ...log, question_plan_id: keyFor(plan.subject_id, plan.date) })
    }
  }
  const progress = withQuestionProgress(weekly.map(plan => ({ id: keyFor(plan.subject_id, plan.date) })), grouped)
  const byId = new Map(weekly.map((plan, index) => [plan.id, progress[index]]))
  return plans.map(plan => {
    if (plan.period === 'week' && plan.note) {
      const [own] = withQuestionProgress([plan], logs.filter(log => log.question_plan_id === plan.id && Number.isFinite(Date.parse(log.created_at)) && ((carryBefore && plan.date < carryBefore) || weekKey(logDay(log)) === weekKey(plan.date))))
      return own
    }
    const aggregate = byId.get(plan.id)
    return aggregate ? { ...plan, ...aggregate, id: plan.id } : plan
  })
}
