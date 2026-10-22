import test from 'node:test'
import assert from 'node:assert/strict'
import { readActiveMockExam, mockExamTime, mockExamPayload, formatMockDuration, nextNumberedMockTitle, MOCK_EXAM_STORAGE_PREFIX } from '../src/lib/mockExamSession.ts'
import { bindMockExamOwner, persistMockExam, clearMockExamResult, useMockExamStore } from '../src/lib/mockExamStore.ts'

const startedAt = Date.parse('2026-10-22T09:00:00Z')
const exam = { sessionId: 'session-1', subjectId: null, mode: 'countdown', examId: 'exam-1', examName: 'YDT', examColor: '#4269a8', title: 'Deneme - 4', durationMinutes: 80, startedAt, endsAt: startedAt + 80 * 60_000, date: '2026-10-22' }

test('closed tabs and background throttling do not lose elapsed time; overdue countdowns cap at their deadline', () => {
  const restored = readActiveMockExam(JSON.parse(JSON.stringify(exam)))
  assert.deepEqual(mockExamTime(restored, startedAt + 25 * 60_000), { elapsed: 1500, remaining: 3300 })
  assert.deepEqual(mockExamTime(restored, startedAt + 3 * 3600_000), { elapsed: 4800, remaining: 0 })
  const stopwatch = readActiveMockExam({ ...exam, mode: 'stopwatch', endsAt: null, durationMinutes: 0 })
  assert.deepEqual(mockExamTime(stopwatch, startedAt + 3 * 3600_000), { elapsed: 10800, remaining: null })
  assert.equal(formatMockDuration(10800), '03:00:00')
})

test('early finish and retry keep the same exact duration and session identity after reopening', () => {
  const finished = readActiveMockExam({ ...exam, finishedAt: startedAt + 123456 })
  assert.deepEqual(mockExamTime(finished, startedAt + 3600_000), { elapsed: 123, remaining: 4677 })
  const payload = mockExamPayload(finished, 'user-1')
  assert.equal(payload.id, 'session-1')
  assert.equal(payload.duration_minutes, 2.0576)
  assert.equal(payload.ended_at, new Date(startedAt + 123456).toISOString())
  assert.deepEqual(mockExamPayload(readActiveMockExam(JSON.parse(JSON.stringify(finished))), 'user-1'), payload)
})

test('legacy timers receive a stable ID; malformed and nonfinite timers cannot start', () => {
  const legacy = { ...exam, sessionId: undefined, mode: undefined }
  const restored = readActiveMockExam(legacy)
  assert.ok(restored.sessionId)
  assert.equal(readActiveMockExam(restored).sessionId, restored.sessionId)
  assert.equal(restored.mode, 'countdown')
  for (const patch of [{ durationMinutes: NaN }, { durationMinutes: 0 }, { durationMinutes: 601 }, { durationMinutes: 1.5 }, { startedAt: Infinity }, { examId: '' }]) {
    assert.equal(readActiveMockExam({ ...exam, ...patch }), null)
  }
})

test('numbered default names increment the highest integer and ignore custom names', () => {
  assert.equal(nextNumberedMockTitle([]), 'Deneme - 1')
  assert.equal(nextNumberedMockTitle(['YDT · Deneme - 2', 'AGS · Deneme - 11', 'Pegem 99', null, 'Deneme - 4']), 'Deneme - 12')
})

test('persisted timers are isolated by account and retained until their matching final result is saved', () => {
  const data = new Map()
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
  bindMockExamOwner('user-1')
  persistMockExam('user-1', { ...exam, finishedAt: exam.endsAt, recorded: true })
  bindMockExamOwner('user-2')
  assert.equal(useMockExamStore.getState().active, null)
  assert.throws(() => persistMockExam('user-1', exam))
  bindMockExamOwner('user-1')
  assert.equal(useMockExamStore.getState().active.recorded, true)
  clearMockExamResult('user-1', 'wrong-session')
  assert.ok(data.has(MOCK_EXAM_STORAGE_PREFIX + 'user-1'))
  clearMockExamResult('user-1', exam.sessionId)
  assert.equal(data.has(MOCK_EXAM_STORAGE_PREFIX + 'user-1'), false)
})

test('storage failure never creates an unpersisted active timer', () => {
  bindMockExamOwner(null)
  useMockExamStore.setState({ ownerId: 'user-1' })
  globalThis.localStorage.setItem = () => { throw new Error('quota exceeded') }
  assert.throws(() => persistMockExam('user-1', exam), /quota/)
  assert.equal(useMockExamStore.getState().active, null)
})
