import test from 'node:test'
import assert from 'node:assert/strict'
import { buildVideoPlanExport } from '../src/lib/videoPlanExport.ts'
const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']
test('populated exports serialize without initialization errors and count only the selected week once', () => {
  const resources = [{ id: 'a', name: 'MEB-AGS Kaynak', subject_name: 'MEB AGS Sözel', avg_video_duration: 25 }]
  const items = [
    { resource_id: 'a', date: dates[0], video_count: 2, watched_count: 1, sort_order: 2 },
    { resource_id: 'a', date: dates[0], video_count: 1, watched_count: 1, is_completed: true, sort_order: 1 },
    { resource_id: 'a', date: dates[2], video_count: 3 },
    { resource_id: 'a', date: '2026-10-12', video_count: 10 },
  ]
  const before = structuredClone(items)
  const data = JSON.parse(JSON.stringify(buildVideoPlanExport(dates, items, resources)))
  assert.deepEqual(data.ozet, { toplam_video: 6, toplam_dk: 150, izlenen_video: 2 })
  assert.deepEqual(data.hafta, { baslangic: dates[0], bitis: dates[6] })
  assert.equal(data.gunler.length, 7)
  assert.deepEqual(data.gunler[1].planlar, [])
  assert.deepEqual(data.gunler[0].planlar[0], { ders: 'Sözel', kaynak: 'Kaynak', video: 1, izlenen: 1, tamamlandi: true, sure_dk: 25 })
  assert.deepEqual(items, before)
})
test('empty weeks and missing resources produce valid JSON without losing video counts', () => {
  assert.deepEqual(buildVideoPlanExport(dates, [], []).ozet, { toplam_video: 0, toplam_dk: 0, izlenen_video: 0 })
  const data = buildVideoPlanExport(dates, [{ date: dates[0], resource_id: 'deleted', video_count: 2 }], [])
  assert.equal(data.ozet.toplam_video, 2)
  assert.equal(data.ozet.toplam_dk, 0)
  assert.equal(data.gunler[0].planlar[0].kaynak, '')
})
