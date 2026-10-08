import test from 'node:test'
import assert from 'node:assert/strict'
import { weeklyPlanDateKeys } from '../src/lib/weeklyPlanDates.ts'
import { localDayKey, mondayOf } from '../src/lib/statsPeriod.ts'
process.env.TZ = 'Europe/Istanbul'
test('Turkish Monday is not saved as UTC Sunday; old plans remain readable', () => {
  const monday = mondayOf(new Date('2026-10-08T15:00:00'))
  assert.equal(monday.toISOString().slice(0, 10), '2026-10-04')
  assert.equal(localDayKey(monday), '2026-10-05')
  assert.deepEqual(weeklyPlanDateKeys(monday), ['2026-10-05', '2026-10-04'])
})
test('Sunday belongs to the preceding week, including year boundaries', () => {
  assert.deepEqual(weeklyPlanDateKeys(new Date('2026-10-11T23:59:59')), ['2026-10-05', '2026-10-04'])
  assert.deepEqual(weeklyPlanDateKeys(new Date('2027-01-01T12:00:00')), ['2026-12-28', '2026-12-27'])
})
