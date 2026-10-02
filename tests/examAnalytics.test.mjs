import test from 'node:test'
import assert from 'node:assert/strict'
import { examTrend, questionComparison, answerNet } from '../src/lib/examAnalytics.ts'
const exam = { id: 'exam', wrong_penalty: 4, point_per_net: 2 }
const result = (id, date, draft = false) => ({ id, exam_id: 'exam', title: id, date, created_at: `${date}T12:00:00Z`, is_draft: draft })
const answer = (id, type, correct, incorrect) => ({ result_id: id, question_type_id: type, correct_count: correct, incorrect_count: incorrect })
test('history is chronological, excludes drafts, and applies the exam scoring rule', () => {
  const rows = examTrend([result('later', '2026-10-02'), result('draft', '2026-10-03', true), result('first', '2026-10-01')], [answer('later', 'a', 30, 8), answer('first', 'a', 20, 4)], exam)
  assert.deepEqual(rows.map(r => r.id), ['first', 'later'])
  assert.equal(rows[1].net, 28); assert.equal(rows[1].points, 56); assert.equal(rows[0].order, 1)
})
test('missing question records are gaps, not falsely counted as zero scores', () => {
  const results = [result('a', '2026-10-01'), result('b', '2026-10-02')]
  const answers = [answer('b', 'type', 10, 4)]
  const trend = examTrend(results, answers, exam, 'type')
  assert.equal(trend[0].net, null); assert.equal(trend[1].net, 9)
  const comparison = questionComparison(results, answers, exam, [{ id: 'type', exam_id: 'exam', name: 'Paragraf' }])
  assert.equal(comparison[0].change, null); assert.equal(comparison[0].previousNet, null)
})
test('a real zero result stays distinct from missing data and negative subject nets remain visible', () => {
  const rows = examTrend([result('a', '2026-10-01'), result('b', '2026-10-02')], [answer('a', 'type', 0, 0), answer('b', 'type', 0, 4)], exam, 'type')
  assert.equal(rows[0].net, 0); assert.equal(rows[1].net, -1)
})
test('question comparison uses penalty-adjusted nets and never compares drafts', () => {
  const rows = questionComparison([result('a', '2026-10-01'), result('b', '2026-10-02'), result('c', '2026-10-03', true)], [answer('a', 'type', 10, 8), answer('b', 'type', 12, 4)], exam, [{ id: 'type', exam_id: 'exam', name: 'Paragraf' }])
  assert.equal(rows[0].previousNet, 8); assert.equal(rows[0].latestNet, 11); assert.equal(rows[0].change, 3)
})
test('exams without a wrong-answer penalty do not subtract wrong answers', () => {
  assert.equal(answerNet(10, 5, null), 10); assert.equal(answerNet(10, 5, 0), 10)
})
