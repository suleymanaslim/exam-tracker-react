import test from 'node:test'
import assert from 'node:assert/strict'
import { watchedVideos, isPendingVideo, videoDisplayDate, videoPartLabel } from '../src/lib/videoWatch.ts'
import { buildVideoPlanExport } from '../src/lib/videoPlanExport.ts'
import { mergeHistoryEntries } from '../src/lib/historyEntries.ts'
import { shouldRefreshRoute } from '../src/lib/routeRecovery.ts'

test('a quarter, half or two thirds never counts as a completed video', () => {
  for (const total of [2, 3, 4]) for (let done = 0; done <= total; done++) {
    const item = { id: 'v', date: '2026-10-08', video_count: 1, watch_parts_total: total, watch_parts_done: done, watched_count: 1 }
    assert.equal(watchedVideos(item), done === total ? 1 : 0)
    assert.equal(isPendingVideo(item), done > 0 && done < total)
    assert.equal(videoPartLabel(item), `${done}/${total}`)
  }
  assert.equal(watchedVideos({ video_count: 3, watched_count: 2 }), 2)
})
test('Monday completion appears once in its completion week; partials export zero videos', () => {
  const item = { id: 'v', resource_id: 'r', date: '2026-10-08', video_count: 1, watch_parts_total: 4, watch_parts_done: 1, watched_count: 0 }
  assert.equal(videoDisplayDate(item), item.date)
  assert.equal(buildVideoPlanExport(['2026-10-08'], [item], []).ozet.izlenen_video, 0)
  const done = { ...item, completion_week: '2026-10-19', watch_parts_done: 4, watched_count: 1 }
  assert.equal(buildVideoPlanExport(['2026-10-08'], [done], []).ozet.izlenen_video, 0)
  const result = buildVideoPlanExport(['2026-10-19'], [done], [])
  assert.equal(result.ozet.izlenen_video, 1)
  assert.equal(result.gunler[0].planlar[0].toplam_parca, 4)
})
test('history includes manual solutions, enriches timed solutions once and excludes removed results', () => {
  const plan = { id: 'p', subject_id: 's', resource_id: 'r', archived_at: '2026-10-01' }
  const sessions = [{ id: 'session', subject_id: 's', resource_id: 'r', session_type: 'manual', started_at: '2026-10-20T12:00:00Z', ended_at: '2026-10-20T12:30:00Z', duration_minutes: 30, note: null, is_edited: false }]
  const log = { id: 'l', question_plan_id: 'p', created_at: '2026-10-20T12:31:00Z', solved_questions: 20, correct_questions: 15, wrong_questions: 5, note: 'Konu', session_id: null }
  const rows = mergeHistoryEntries(sessions, [plan], [log, { ...log, id: 'timed', session_id: 'session' }, { ...log, id: 'deleted', deleted_at: '2026-10-21' }])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].session_type, 'question_solve')
  assert.equal(rows[0].duration_minutes, 0)
  assert.equal(rows[0].subject_id, 's')
  assert.equal(rows[0].question.note, 'Konu')
  assert.equal(rows[1].question.id, 'timed')
  assert.equal(rows.reduce((sum, row) => sum + row.duration_minutes, 0), 30)
})
test('stale chunks refresh once per build; offline, runtime errors and blocked storage do not loop', () => {
  const map = new Map(), storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) }
  const error = new TypeError('Failed to fetch dynamically imported module: https://example.com/stale.js')
  assert.equal(shouldRefreshRoute(error, storage, 'a', false), false)
  assert.equal(shouldRefreshRoute(new Error('Cannot read properties of null'), storage, 'a', true), false)
  assert.equal(shouldRefreshRoute(error, storage, 'a', true), true)
  assert.equal(shouldRefreshRoute(error, storage, 'a', true), false)
  assert.equal(shouldRefreshRoute(error, storage, 'b', true), true)
  assert.equal(shouldRefreshRoute(error, { getItem() { throw new Error('SecurityError') } }, 'c', true), false)
})
