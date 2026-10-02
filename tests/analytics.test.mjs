import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeStudy, minutesLabel } from '../src/lib/studyAnalytics.ts'
import { fitPrintScale } from '../src/lib/videoPlanPrint.ts'
const session = (id, day, minutes, subject = 'math') => ({ id, subject_id: subject, started_at: `${day}T10:00:00`, duration_minutes: minutes })
test('weekly totals exclude adjacent weeks and daily average includes zero days', () => {
  const data = analyzeStudy([session('a', '2026-09-28', 60), session('b', '2026-09-30', 30), session('c', '2026-10-05', 100)], '2026-09-28', new Date('2026-10-10T12:00:00'))
  assert.equal(data.total, 90); assert.equal(data.active, 2); assert.equal(data.days, 7)
  assert.equal(data.dailyAverage, 90 / 7); assert.equal(data.sessionAverage, 45)
  assert.equal(data.buckets.length, 7); assert.equal(data.buckets[1].minutes, 0)
})
test('current week compares the same elapsed weekdays, not an entire previous week', () => {
  const data = analyzeStudy([session('a', '2026-09-28', 50), session('b', '2026-09-21', 40), session('c', '2026-09-25', 400)], '2026-09-28', new Date('2026-09-30T12:00:00'))
  assert.equal(data.days, 3); assert.equal(data.previous, 40); assert.equal(data.total, 50)
})
test('future week is empty and never produces negative or infinite averages', () => {
  const data = analyzeStudy([session('a', '2026-10-06', 50)], '2026-10-05', new Date('2026-10-02T12:00:00'))
  assert.equal(data.days, 0); assert.equal(data.dailyAverage, 0); assert.equal(data.total, 0)
})
test('all-time totals include older history while recent chart includes zero weeks', () => {
  const data = analyzeStudy([session('a', '2025-01-01', 60), session('b', '2026-10-02', 30)], null, new Date('2026-10-02T12:00:00'))
  assert.equal(data.total, 90); assert.equal(data.buckets.length, 12)
  assert.equal(data.buckets.reduce((s, b) => s + b.minutes, 0), 30)
  assert.ok(data.days > 600)
})
test('unassigned subjects remain in totals and shares; invalid sessions are excluded', () => {
  const data = analyzeStudy([session('a', '2026-09-28', 60, null), session('b', '2026-09-28', -5), session('c', 'bad-date', 20), session('d', '2026-09-28', NaN)], '2026-09-28', new Date('2026-10-02T12:00:00'))
  assert.equal(data.total, 60); assert.equal(data.bySubject[0].id, 'unassigned')
  assert.equal(data.timeOfDay.reduce((s, n) => s + n, 0), data.total)
})
test('duration formatting rounds minutes consistently', () => {
  assert.equal(minutesLabel(59.9), '1 sa'); assert.equal(minutesLabel(90), '1 sa 30 dk'); assert.equal(minutesLabel(0), '0 dk')
})
test('one-page scaling fits both dimensions without enlarging or cropping long calendars', () => {
  for (const [width, height] of [[1120, 280], [1200, 1500], [2000, 5000]]) {
    const scale = fitPrintScale(width, height, 1046, 699)
    assert.ok(width * scale <= 1046); assert.ok(height * scale <= 699); assert.ok(scale <= 1)
  }
})
