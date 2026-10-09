import test from 'node:test'
import assert from 'node:assert/strict'
import { persistQuestionSession } from '../src/lib/questionSession.ts'
import { timerSaveError } from '../src/lib/timerSaveError.ts'

const session = {
  id: '00000000-0000-4000-8000-000000000001', ownerId: 'alice', subjectId: 'verbal', resourceId: '',
  mode: 'questions', questionPlanId: null, questionDate: '2026-10-09',
  startedAt: '2026-10-09T17:00:00Z', endedAt: '2026-10-09T17:00:03Z',
  durationMinutes: 3 / 60, remainingSeconds: 3, resume: false, solvedQuestions: 5,
}
const missing = { code: 'PGRST202', message: 'Could not find function in the schema cache' }

test('a three-second question save preserves exact duration, counts, UUID and note', async () => {
  const calls = []
  await persistQuestionSession({ ...session, questionNote: 'Sözcükte anlam' }, async payload => { calls.push(payload); return { error: null } })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].p_duration_minutes, 0.05)
  assert.equal(calls[0].p_questions, 5)
  assert.equal(calls[0].p_session_id, session.id)
  assert.equal(calls[0].p_note, 'Sözcükte anlam')
})
test('a note-free save can use the older RPC signature only after a missing signature response', async () => {
  const calls = []
  await persistQuestionSession(session, async payload => { calls.push(payload); return { error: calls.length === 1 ? missing : null } })
  assert.equal(calls.length, 2)
  const { p_note, ...expected } = calls[0]
  assert.equal(p_note, null)
  assert.deepEqual(calls[1], expected)
  assert.equal(calls[1].p_duration_minutes, 3 / 60)
})
test('compatibility never silently discards a note', async () => {
  let calls = 0
  await assert.rejects(persistQuestionSession({ ...session, questionNote: 'Notum' }, async () => { calls++; return { error: missing } }), error => error === missing)
  assert.equal(calls, 1)
})
test('permission, constraint and network failures never retry using different arguments', async () => {
  for (const error of [{ code: '42501' }, { code: '23514' }, new TypeError('Network failure')]) {
    let calls = 0
    await assert.rejects(persistQuestionSession(session, async () => { calls++; return { error } }), actual => actual === error)
    assert.equal(calls, 1)
  }
})
test('a failed legacy save keeps its actual error instead of claiming success', async () => {
  const denied = { code: '42501' }
  let calls = 0
  await assert.rejects(persistQuestionSession(session, async () => ({ error: ++calls === 1 ? missing : denied })), error => error === denied)
  assert.equal(calls, 2)
})
test('save errors give actionable schema and permission messages without injecting server text', () => {
  assert.match(timerSaveError(missing, true), /question_plans\.sql/)
  assert.match(timerSaveError({ code: '42501' }, true), /Kaydetme izni/)
  assert.match(timerSaveError({ code: '23514' }, true), /23514/)
  assert.doesNotMatch(timerSaveError({ code: '<script>alert(1)</script>', message: '<img src=x onerror=alert(1)>' }), /<script|<img/)
})
