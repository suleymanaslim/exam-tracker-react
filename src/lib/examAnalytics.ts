export interface ExamEntry { id: string; exam_id: string; title: string; date: string; created_at: string; is_draft?: boolean }
export interface AnswerEntry { result_id: string; question_type_id: string; correct_count: number; incorrect_count: number }
export interface ExamRule { id: string; wrong_penalty: number | null; point_per_net: number }
export function answerNet(correct: number, incorrect: number, penalty: number | null) {
  return Math.round((correct - (penalty && penalty > 0 ? incorrect / penalty : 0)) * 100) / 100
}
export function examTrend(results: ExamEntry[], details: AnswerEntry[], exam: ExamRule | undefined, questionType: string = '') {
  if (!exam) return []
  return results.filter(r => r.exam_id === exam.id && !r.is_draft)
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((result, index) => {
      const answers = details.filter(d => d.result_id === result.id && (!questionType || d.question_type_id === questionType))
      const correct = answers.reduce((sum, d) => sum + d.correct_count, 0)
      const incorrect = answers.reduce((sum, d) => sum + d.incorrect_count, 0)
      const net = answers.length ? (questionType ? answerNet(correct, incorrect, exam.wrong_penalty) : Math.max(0, answerNet(correct, incorrect, exam.wrong_penalty))) : null
      return { id: result.id, order: index + 1, name: result.title, date: result.date, correct, incorrect, net, points: net === null ? null : Math.max(0, Math.round(net * (exam.point_per_net || 1) * 100) / 100) }
    })
}
export function questionComparison(results: ExamEntry[], details: AnswerEntry[], exam: ExamRule | undefined, types: { id: string; exam_id: string; name: string }[]) {
  const trend = examTrend(results, details, exam)
  const latest = trend.at(-1), previous = trend.at(-2)
  if (!latest || !exam) return []
  return types.filter(q => q.exam_id === exam.id).map(q => {
    const last = details.find(d => d.result_id === latest.id && d.question_type_id === q.id)
    const prev = previous ? details.find(d => d.result_id === previous.id && d.question_type_id === q.id) : undefined
    const latestNet = last ? answerNet(last.correct_count, last.incorrect_count, exam.wrong_penalty) : null
    const previousNet = prev ? answerNet(prev.correct_count, prev.incorrect_count, exam.wrong_penalty) : null
    return { id: q.id, name: q.name, correct: last?.correct_count ?? null, incorrect: last?.incorrect_count ?? null, latestNet, previousNet, change: latestNet !== null && previousNet !== null ? Math.round((latestNet - previousNet) * 100) / 100 : null }
  })
}
