import test from 'node:test'
import assert from 'node:assert/strict'
import { buildExamResultsExport, downloadExamResultsJson } from '../src/lib/examResultsExport.ts'

test('exports every page, all drafts, definitions, details and timed sessions as valid JSON', async () => {
  const results = Array.from({ length: 1001 }, (_, id) => ({ id, title: `Türkçe ${id}`, is_draft: id % 2 === 0 }))
  const tables = { exams: [{ id: 'exam', wrong_penalty: 4 }], exam_question_types: [{ id: 'type', name: 'Sözel' }], exam_results: results, exam_result_details: [{ result_id: 1000, correct_count: 20, incorrect_count: 4 }], study_sessions: [{ id: 1000, duration_minutes: 80 }] }
  const calls = []
  const output = await buildExamResultsExport((table, from, to) => {
    calls.push([table, from, to])
    return Promise.resolve({ data: tables[table].slice(from, to + 1), error: null })
  }, new Date('2026-10-25T12:00:00Z'))
  const parsed = JSON.parse(JSON.stringify(output))
  assert.equal(parsed.schema_version, 1)
  assert.equal(parsed.exported_at, '2026-10-25T12:00:00.000Z')
  assert.deepEqual(parsed.results, results)
  assert.deepEqual(parsed.question_types, tables.exam_question_types)
  assert.deepEqual(parsed.exams, tables.exams)
  assert.deepEqual(parsed.result_details, tables.exam_result_details)
  assert.deepEqual(parsed.timed_sessions, tables.study_sessions)
  assert.deepEqual(calls.filter(([t]) => t === 'exam_results'), [['exam_results', 0, 499], ['exam_results', 500, 999], ['exam_results', 1000, 1499]])
})
test('empty accounts produce an empty export; a failed page never produces a partial export', async () => {
  const empty = await buildExamResultsExport(() => Promise.resolve({ data: [], error: null }))
  assert.deepEqual(empty.results, [])
  await assert.rejects(buildExamResultsExport((table, from) => Promise.resolve(table === 'exam_results' && from > 0 ? { data: null, error: new Error('network failure') } : { data: table === 'exam_results' ? Array.from({ length: 500 }, (_, id) => ({ id })) : [], error: null })), /network failure/)
  await assert.rejects(buildExamResultsExport(() => Promise.resolve({ data: null, error: null })), /okunamadı/)
})
test('download supplies a UTF-8 JSON blob and a safe filename then cleans up', async () => {
  const originals = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL, timer: globalThis.setTimeout }
  let blob, clicked = false, removed = false, cleanup
  const anchor = { click() { clicked = true }, remove() { removed = true } }
  globalThis.document = { createElement: () => anchor, body: { appendChild() {} } }
  URL.createObjectURL = value => { blob = value; return 'blob:export' }
  URL.revokeObjectURL = value => assert.equal(value, 'blob:export')
  globalThis.setTimeout = callback => { cleanup = callback }
  try {
    const data = await buildExamResultsExport(() => Promise.resolve({ data: [], error: null }))
    downloadExamResultsJson(data)
    assert.equal(clicked && removed, true)
    assert.equal(anchor.href, 'blob:export')
    assert.match(anchor.download, /^denemeler_[\w-]+\.json$/)
    assert.equal(blob.type, 'application/json;charset=utf-8')
    assert.deepEqual(JSON.parse(await blob.text()), data)
    cleanup()
  } finally {
    globalThis.document = originals.document
    URL.createObjectURL = originals.create
    URL.revokeObjectURL = originals.revoke
    globalThis.setTimeout = originals.timer
  }
})
