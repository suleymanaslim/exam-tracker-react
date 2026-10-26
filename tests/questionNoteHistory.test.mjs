import test from 'node:test'
import assert from 'node:assert/strict'
import { readQuestionNoteHistory, matchingQuestionNotes } from '../src/lib/questionNoteHistory.ts'

test('previous goal topics and solution notes merge by recency, deduplicating Turkish text', async () => {
  const notes = await readQuestionNoteHistory(source => Promise.resolve({ error: null, data: source === 'plans' ? [
    { note: '  Sözcükte anlam ', created_at: '2026-10-23T10:00:00Z' },
    { note: 'İsimler', created_at: '2026-10-22T10:00:00Z' },
  ] : [
    { note: 'sözcükte anlam', created_at: '2026-10-21T10:00:00Z' },
    { note: 'Çözümde yazılan', created_at: '2026-10-24T10:00:00Z' },
    { note: ' ', created_at: '2026-10-25T10:00:00Z' },
  ] }))
  assert.deepEqual(notes, ['Çözümde yazılan', 'Sözcükte anlam', 'İsimler'])
  assert.deepEqual(matchingQuestionNotes(notes, 'SÖZCÜK'), ['Sözcükte anlam'])
  assert.deepEqual(matchingQuestionNotes(notes, ' isim '), ['İsimler'])
  assert.deepEqual(matchingQuestionNotes(notes, 'olmayan'), [])
  assert.deepEqual(matchingQuestionNotes(notes, ''), notes)
})
test('history paginates both sources and retains notes beyond the first 1000', async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ note: `Konu ${i}`, created_at: '2026-10-22T10:00:00Z' }))
  const calls = []
  const notes = await readQuestionNoteHistory((source, from, to) => {
    calls.push([source, from, to])
    return Promise.resolve({ error: null, data: source === 'plans' ? rows.slice(from, to + 1) : [] })
  })
  assert.equal(notes.length, 1001)
  assert.equal(notes.at(-1), 'Konu 1000')
  assert.ok(calls.some(([source, from]) => source === 'plans' && from === 1000))
})
test('one failed source keeps the other usable; an entirely unavailable history rejects safely', async () => {
  assert.deepEqual(await readQuestionNoteHistory(source => Promise.resolve(source === 'plans' ? { error: new Error('missing column'), data: null } : { error: null, data: [{ note: 'Önceki çözüm' }] })), ['Önceki çözüm'])
  await assert.rejects(readQuestionNoteHistory(() => Promise.resolve({ error: new Error('offline'), data: null })), /Konu geçmişi/)
})
