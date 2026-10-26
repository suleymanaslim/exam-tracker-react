import test from 'node:test'
import assert from 'node:assert/strict'
import { questionWeekDays, dailyQuestionTargets, weekTargetPayload, questionWeekError } from '../src/lib/questionWeek.ts'
process.env.TZ = 'Europe/Istanbul'
test('a week always contains seven local dates in order across month and year boundaries', () => {
  assert.deepEqual(questionWeekDays('2027-01-03').map(day => day.date), ['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03'])
  assert.equal(questionWeekDays('2026-10-18')[0].label, 'Pazartesi')
})
test('daily board keeps video goals on their date and excludes weekly totals, archived goals and unplanned logs', () => {
  const plans = [
    { id: 'daily', date: '2026-10-19', target_questions: 30 },
    { id: 'video', date: '2026-10-21', target_questions: 45, video_plan_item_id: 'v' },
    { id: 'weekly', date: '2026-10-19', period: 'week', target_questions: 100 },
    { id: 'archived', date: '2026-10-19', target_questions: 15, archived_at: '2026-10-20' },
    { id: 'log-only', date: '2026-10-19', target_questions: null },
    { id: 'other-week', date: '2026-10-26', target_questions: 20 },
  ]
  const days = dailyQuestionTargets(plans, '2026-10-19')
  assert.deepEqual(days[0].plans.map(plan => plan.id), ['daily'])
  assert.deepEqual(days[2].plans.map(plan => plan.id), ['video'])
  assert.equal(days.flatMap(day => day.plans).length, 2)
})
test('week form serializes only selected days and rejects decimals, zero, letters and out-of-range counts', () => {
  assert.deepEqual(weekTargetPayload('2026-10-19', { '2026-10-19': '45', '2026-10-21': '30', '2026-10-20': '', '2026-10-26': '20' }), [{ date: '2026-10-19', target: 45 }, { date: '2026-10-21', target: 30 }])
  for (const value of ['0', '-5', '2.5', 'abc', '2e3', '100001']) assert.throws(() => weekTargetPayload('2026-10-19', { '2026-10-19': value }))
  assert.throws(() => weekTargetPayload('2026-10-19', {}), /En az bir gün/)
})
test('copy errors explain setup, authorization and the exact missing subject without echoing arbitrary errors', () => {
  assert.match(questionWeekError({ code: 'PGRST202' }), /question_plans.sql/)
  assert.match(questionWeekError({ code: '42501' }), /yalnızca admin/)
  assert.match(questionWeekError({ code: '22023', message: 'QUESTION_COPY_SUBJECT_MAPPING', details: JSON.stringify({ exam: 'AGS', subject: 'Sayısal Yetenek' }) }), /AGS \/ Sayısal Yetenek/)
  assert.doesNotMatch(questionWeekError({ message: 'private database diagnostic' }), /private/)
})

test('week payload keeps each plan identity with trimmed topic notes; blank days remain untouched', () => {
  const values = { '2026-10-19': '45', '2026-10-20': '30' }
  const notes = { '2026-10-19': '  Sözcükte anlam ', '2026-10-20': '', '2026-10-21': 'Unselected' }
  assert.deepEqual(weekTargetPayload('2026-10-19', values, notes, { '2026-10-19': 'topic-plan' }), [
    { date: '2026-10-19', target: 45, note: 'Sözcükte anlam', plan_id: 'topic-plan' },
    { date: '2026-10-20', target: 30, note: null },
  ])
  assert.throws(() => weekTargetPayload('2026-10-19', values, { '2026-10-19': 'x'.repeat(1001) }), /1000/)
})
