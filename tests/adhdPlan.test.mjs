import test from 'node:test'
import assert from 'node:assert/strict'
import { planItemsToTemplate, subjectIndex, tasksToTemplate, templateToRows, weekDayKeys } from '../src/lib/adhdPlan.ts'

const keys = weekDayKeys('2026-11-23')

test('hafta günleri pazartesiden pazara ve ay geçişinde doğru', () => {
  assert.deepEqual(keys, ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'])
  assert.equal(weekDayKeys('2026-12-28')[6], '2027-01-03')
})

test('ders adına göre eşleştirir, AGS dersini tercih eder ve eksik dersleri bildirir', () => {
  const index = subjectIndex([{ id: 'ydsTarih', name: 'Tarih' }, { id: 'agsTarih', name: 'Tarih', ags: true }, { id: 'soz', name: 'Sözel  Yetenek', ags: true }])
  const { rows, missing } = templateToRows([
    { day: 1, subject_name: 'TARİH', note: '20 soru' }, { day: 1, subject_name: 'sözel yetenek', note: null },
    { day: 3, subject_name: 'Coğrafya', note: null }, { day: 7, subject_name: 'Tarih', note: null },
  ], { userId: 'u', dayKeys: keys, subjects: index, existing: { '2026-11-23': 2 } })
  assert.deepEqual(rows.map(row => [row.task_date, row.subject_id, row.note, row.sort_order]), [
    ['2026-11-23', 'agsTarih', '20 soru', 2], ['2026-11-23', 'soz', null, 3], ['2026-11-29', 'agsTarih', null, 0],
  ])
  assert.deepEqual(missing, ['Coğrafya'])
})

test('gün yapıştırma tüm maddeleri seçilen güne koyar', () => {
  const { rows } = templateToRows([{ day: 1, subject_name: 'Tarih', note: null }, { day: 2, subject_name: 'Tarih', note: 'x' }], { userId: 'u', dayKeys: keys, subjects: subjectIndex([{ id: 't', name: 'Tarih' }]), targetDay: 5 })
  assert.deepEqual(rows.map(row => [row.task_date, row.sort_order]), [['2026-11-27', 0], ['2026-11-27', 1]])
})

test('görevler ve kendi haftalık plan maddeleri şablona çevrilir', () => {
  assert.deepEqual(tasksToTemplate([{ task_date: '2026-11-25', note: 'n', subjects: { name: 'Tarih' } }, { task_date: '2026-12-01', note: null, subjects: { name: 'Tarih' } }], keys), [{ day: 3, subject_name: 'Tarih', note: 'n' }])
  const { items, skipped } = planItemsToTemplate([
    { day_of_week: 2, subject_id: 's2', title: 'Video ders', sort_order: 1 }, { day_of_week: 1, subject_id: 's1', title: null, sort_order: 0 },
    { day_of_week: 1, subject_id: null, title: 'Genel tekrar', sort_order: 1 },
  ], { s1: 'Tarih', s2: 'Sözel Yetenek' })
  assert.deepEqual(items, [{ day: 1, subject_name: 'Tarih', note: null }, { day: 2, subject_name: 'Sözel Yetenek', note: 'Video ders' }])
  assert.equal(skipped, 1)
})
