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

test('konular sırayla ilerler: bitmiş ve planlanmış konular atlanır, setler konu tutmaz', async () => {
  const { nextTopic, topicKey } = await import('../src/lib/adhdPlan.ts')
  const topics = [
    { kind: 'personal', id: 'k1', title: 'İlk Türk Devletleri', completed: true },
    { kind: 'personal', id: 'k2', title: 'İslamiyet Öncesi', completed: false },
    { kind: 'personal', id: 'k3', title: 'Osmanlı Kuruluş', completed: false },
    { kind: 'personal', id: 'k4', title: 'Osmanlı Yükselme', completed: false },
  ]
  const catalog = new Map([['tarih', topics]])
  const taken = new Set([topicKey('personal', 'k3')])
  assert.equal(nextTopic(topics, taken).id, 'k2')
  const set = tasksToTemplate([
    { task_date: '2026-11-25', note: null, topic_title: 'Eski konu', subjects: { name: 'Tarih' } },
    { task_date: '2026-11-23', note: null, topic_title: 'Eski konu', subjects: { name: 'Tarih' } },
    { task_date: '2026-11-24', note: 'tekrar', subjects: { name: 'Tarih' } },
  ], keys, false)
  assert.ok(set.every(item => !('topic_title' in item)))
  const { rows } = templateToRows(set, { userId: 'u', dayKeys: keys, subjects: subjectIndex([{ id: 'tarih', name: 'Tarih' }]), catalog, taken })
  // Takvim sırasıyla: Pzt k2, Sal k4 (k3 zaten planlı), Çar konu kalmadı.
  assert.deepEqual(rows.map(row => [row.task_date, row.topic_id, row.topic_title]), [
    ['2026-11-23', 'k2', 'İslamiyet Öncesi'], ['2026-11-24', 'k4', 'Osmanlı Yükselme'], ['2026-11-25', null, null],
  ])
})

test('kopyalanan konu, kişide bitmemiş aynı adlı konu varsa korunur', () => {
  const catalog = new Map([['t', [{ kind: 'shared', id: 's1', title: 'A', completed: false }, { kind: 'shared', id: 's2', title: 'B', completed: false }]]])
  const { rows } = templateToRows([{ day: 2, subject_name: 'Tarih', note: null, topic_title: 'b' }, { day: 3, subject_name: 'Tarih', note: null, topic_title: 'Yok' }],
    { userId: 'u', dayKeys: keys, subjects: subjectIndex([{ id: 't', name: 'Tarih' }]), catalog })
  assert.deepEqual(rows.map(row => [row.topic_kind, row.topic_id]), [['shared', 's2'], ['shared', 's1']])
})

test('hazır ideal hafta: konular sınava yetişir, günde en fazla 3-4 ders, Pazar boş, aynı gün aynı ders yok', async () => {
  const { buildIdealWeek } = await import('../src/lib/adhdPlan.ts')
  const subjects = [
    { name: 'Eğitim Bilimleri', remaining: 40 }, { name: 'Mevzuat', remaining: 12 }, { name: 'Tarih', remaining: 20 },
    { name: 'Coğrafya', remaining: 16 }, { name: 'Sayısal', remaining: 24 }, { name: 'Sözel', remaining: 10 }, { name: 'Biten', remaining: 0 },
  ]
  // 2026-11-23 → 2027-02-01: 10 hafta kaldı, 9 haftada bitmeli (son hafta tekrar).
  const week = buildIdealWeek(subjects, '2026-11-23', '2027-02-01')
  assert.equal(week.weeksLeft, 10); assert.equal(week.studyWeeks, 9)
  const count = name => week.items.filter(item => item.subject_name === name).length
  assert.deepEqual(['Eğitim Bilimleri', 'Mevzuat', 'Tarih', 'Coğrafya', 'Sayısal', 'Sözel'].map(count), [5, 2, 3, 2, 3, 2])
  assert.equal(count('Biten'), 0)
  assert.ok(week.fits); assert.equal(week.perWeek, 17)
  for (const name of ['Eğitim Bilimleri', 'Tarih', 'Sayısal']) assert.ok(count(name) * week.studyWeeks >= subjects.find(s => s.name === name).remaining, `${name} yetişir`)
  for (let day = 1; day <= 7; day++) {
    const list = week.items.filter(item => item.day === day).map(item => item.subject_name)
    assert.ok(list.length <= 3, `gün ${day} en fazla 3 ders`)
    assert.equal(new Set(list).size, list.length, `gün ${day} aynı ders tekrar etmez`)
  }
  assert.equal(week.items.filter(item => item.day === 7).length, 0, 'Pazar dinlenme')
  assert.ok(week.items.every(item => item.note && !item.topic_title))

  // Sığmıyorsa günde 4'e çıkar ve uyarır; sınav tarihi yoksa 12 hafta varsayılır.
  const tight = buildIdealWeek([{ name: 'A', remaining: 200 }, { name: 'B', remaining: 200 }], '2026-11-23', '2026-12-07')
  assert.equal(tight.fits, false); assert.equal(tight.perWeek, 24)
  const noDate = buildIdealWeek([{ name: 'A', remaining: 24 }], '2026-11-23', null)
  assert.equal(noDate.examKnown, false); assert.equal(noDate.studyWeeks, 11); assert.equal(noDate.perWeek, 3)
})
