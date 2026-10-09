import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeQuestions, withWeeklyQuestionProgress } from '../src/lib/questionAnalytics.ts'
import { solvedQuestionPresets, withQuestionProgress, openQuestionPlans } from '../src/lib/questionPlan.ts'
process.env.TZ = 'Europe/Istanbul'
const plan = (id, subject = 'verbal', target = 20, date = '2026-10-09', extra = {}) => ({ id, user_id: 'alice', subject_id: subject, date, period: 'day', target_questions: target, subjects: { name: subject, exam_id: 'ags' }, solved_questions: 0, ...extra })
const result = (id, count, created = '2026-10-09T10:00:00Z', extra = {}) => ({ id: `log-${id}-${count}`, question_plan_id: id, solved_questions: count, created_at: created, ...extra })

test('solved presets scale with goals using whole multiples of five, including 10/15/20', () => {
  assert.deepEqual(solvedQuestionPresets(20), [10, 15, 20])
  assert.deepEqual(solvedQuestionPresets(30), [15, 20, 25, 30])
  assert.deepEqual(solvedQuestionPresets(45), [25, 30, 35, 40, 45])
  assert.deepEqual(solvedQuestionPresets(3), [])
  assert.deepEqual(solvedQuestionPresets(null), [5, 10, 15, 20, 30, 45])
  for (const target of [5, 7, 19, 21, 100, 455, 100000]) {
    const choices = solvedQuestionPresets(target)
    assert.ok(choices.length <= 9)
    assert.ok(choices.every(n => Number.isInteger(n) && n % 5 === 0 && n >= target / 2 && n <= target))
    assert.equal(choices.at(-1), Math.floor(target / 5) * 5)
  }
})
test('weekly subject goals cover video, daily and extra counts without duplicate targets', () => {
  const plans = [plan('weekly', 'verbal', 100, '2026-10-05', { period: 'week' }), plan('video', 'verbal', 30), plan('day', 'verbal', 20), plan('extra', 'verbal', null), plan('math', 'math', 40)]
  const logs = [result('video', 30), result('day', 15), result('extra', 10), result('weekly', 5), result('math', 20)]
  const data = analyzeQuestions(plans, logs, '2026-10-05', '2026-10-09')
  assert.equal(data.target, 140)
  assert.equal(data.solved, 80)
  assert.equal(data.remaining, 60)
  assert.equal(data.progress, 57)
  const weekly = withWeeklyQuestionProgress(withQuestionProgress(plans, logs), logs).find(p => p.id === 'weekly')
  assert.equal(weekly.solved_questions, 60)
  assert.equal(withQuestionProgress(plans, logs).find(p => p.id === 'video').solved_questions, 30)
})
test('overshooting another subject never conceals an unfinished subject goal', () => {
  const data = analyzeQuestions([plan('verbal'), plan('math', 'math')], [result('verbal', 70)], '2026-10-05')
  assert.equal(data.solved, 70)
  assert.equal(data.remaining, 20)
  assert.equal(data.progress, 50)
})
test('archiving a goal removes its target while preserving solved history and subject attribution', () => {
  const plans = [plan('removed', 'verbal', 100, '2026-10-05', { period: 'week', archived_at: '2026-10-09T12:00:00Z' }), plan('video', 'verbal', 30)]
  const logs = [result('removed', 15), result('video', 20)]
  const data = analyzeQuestions(plans, logs, '2026-10-05')
  assert.equal(data.target, 30)
  assert.equal(data.solved, 35)
  assert.equal(data.remaining, 0)
  assert.equal(data.bySubject[0].name, 'verbal')
  assert.deepEqual(openQuestionPlans(withQuestionProgress(plans, logs), '2026-10-09').map(p => p.id), ['video'])
})
test('correcting or removing a log recalculates daily, weekly and total counts once', () => {
  const plans = [plan('weekly', 'verbal', 100, '2026-10-05', { period: 'week' }), plan('video')]
  const old = result('video', 30)
  const corrected = { ...old, solved_questions: 15, correct_questions: 10, wrong_questions: 5 }
  const removed = result('weekly', 20, undefined, { deleted_at: '2026-10-09T12:00:00Z' })
  for (const week of [null, '2026-10-05']) {
    const data = analyzeQuestions(plans, [corrected, removed], week, '2026-10-09')
    assert.equal(data.solved, 15)
    assert.equal(data.today, 15)
    assert.equal(data.remaining, 85)
    assert.equal(data.bySubject[0].correct, 10)
    assert.equal(data.bySubject[0].wrong, 5)
  }
  assert.equal(withQuestionProgress(plans, [corrected, removed])[0].solved_questions, 0)
  assert.equal(withWeeklyQuestionProgress(plans, [corrected, removed])[0].solved_questions, 15)
})
test('actual recording date controls statistics even after a goal is rescheduled', () => {
  const log = result('old', 20, '2026-10-08T10:00:00Z')
  const rescheduled = plan('old', 'verbal', 30, '2026-10-19')
  const data = analyzeQuestions([rescheduled], [log], '2026-10-05')
  assert.equal(data.solved, 20)
  assert.equal(data.target, 0)
  assert.equal(analyzeQuestions([rescheduled], [log], '2026-10-19').solved, 0)
})
test('local Monday boundaries keep late Sunday UTC work in the correct Turkish week', () => {
  const plans = [plan('a')]
  const logs = [result('a', 15, '2026-10-11T20:59:59Z'), result('a', 20, '2026-10-11T21:00:00Z')]
  const week = analyzeQuestions(plans, logs, '2026-10-05')
  assert.equal(week.solved, 15)
  assert.equal(week.buckets.length, 7)
  assert.equal(week.buckets[6].solved, 15)
  const next = analyzeQuestions(plans, logs, '2026-10-12')
  assert.equal(next.solved, 20)
  assert.equal(next.previous, 15)
  assert.equal(next.buckets[0].solved, 20)
})
test('all-time totals retain old records and apply weekly goal override separately each week', () => {
  const plans = [plan('old', 'verbal', 20, '2025-01-06'), plan('day'), plan('weekly', 'verbal', 100, '2026-10-05', { period: 'week' })]
  const data = analyzeQuestions(plans, [result('old', 15, '2025-01-06T10:00:00Z'), result('day', 30)], null)
  assert.equal(data.target, 120)
  assert.equal(data.solved, 45)
  assert.equal(data.remaining, 75)
  assert.equal(data.previous, null)
})
test('weekly goals appear throughout their week but expired, future and archived weekly goals do not', () => {
  const plans = [plan('current', 'verbal', 30, '2026-10-05', { period: 'week' }), plan('expired', 'verbal', 30, '2026-09-28', { period: 'week' }), plan('future', 'math', 40, '2026-10-12', { period: 'week' }), plan('archived', 'math', 40, '2026-10-05', { period: 'week', archived_at: 'now' })]
  for (const date of ['2026-10-05', '2026-10-09', '2026-10-11']) assert.deepEqual(openQuestionPlans(plans, date).map(p => p.id), ['current'])
})
test('missing answer counts stay unknown while a real zero stays visible', () => {
  const plans = [plan('a')]
  const unknown = analyzeQuestions(plans, [result('a', 15)], '2026-10-05').bySubject[0]
  assert.equal(unknown.correctRecorded, false)
  assert.equal(unknown.wrongRecorded, false)
  const known = analyzeQuestions(plans, [result('a', 15, undefined, { correct_questions: 0, wrong_questions: 0 })], '2026-10-05').bySubject[0]
  assert.equal(known.correctRecorded, true)
  assert.equal(known.wrongRecorded, true)
})
