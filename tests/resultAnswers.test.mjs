import test from 'node:test'
import assert from 'node:assert/strict'
import { answerLimit, readAnswerInput, validateAnswers } from '../src/lib/resultAnswers.ts'
import { examHasPoints } from '../src/lib/examTemplates.ts'
import { examTrend } from '../src/lib/examAnalytics.ts'

test('exam inputs reject letters, exponent, signs, decimals and non-digit pastes', () => {
  for (const raw of ['e', '2e3', '-1', '+2', '1.5', '1,5', 'abc', ' 3', '3 ', '5abc', '٣']) {
    assert.equal(readAnswerInput(raw, '', 15), null, raw)
  }
  assert.equal(readAnswerInput('', 3, 15), '')
  assert.equal(readAnswerInput('04', 3, 15), 4)
})
test('both inputs are capped by the remaining questions, including oversized pastes', () => {
  assert.equal(readAnswerInput('20', '', 15), 15)
  assert.equal(readAnswerInput('8', 10, 15), 5)
  assert.equal(readAnswerInput('3', 15, 15), 0)
  assert.equal(readAnswerInput('9'.repeat(500), 10, 15), 5)
  assert.equal(answerLimit(15, 3), 12)
})
test('empty answers become zero for validation; invalid and over-limit stored values still fail', () => {
  assert.equal(validateAnswers(10, '', 15), '')
  assert.equal(validateAnswers('', 3, 15), '')
  assert.equal(validateAnswers('', '', 15), '')
  for (const counts of [[-1, 0], [1.5, 0], [NaN, 0], [11, 5]]) assert.notEqual(validateAnswers(...counts, 15), '')
})
test('AGS legacy names and template markers never calculate points, YDS keeps its scoring', () => {
  const result = [{ id: 'r', exam_id: 'e', date: '2026-10-01', created_at: '2026-10-01T12:00:00Z', title: 'Deneme' }]
  const answers = [{ result_id: 'r', question_type_id: 'q', correct_count: 12, incorrect_count: 4 }]
  for (const rule of [{ name: 'AGS' }, { name: ' meb-ags ' }, { name: 'MEB AGS' }, { name: 'Özel', base_template_key: 'ags' }]) {
    const exam = { id: 'e', wrong_penalty: 4, point_per_net: 1.25, ...rule }
    assert.equal(examHasPoints(exam), false)
    assert.equal(examTrend(result, answers, exam)[0].net, 11)
    assert.equal(examTrend(result, answers, exam)[0].points, null)
  }
  assert.equal(examTrend(result, answers, { id: 'e', name: 'YDS', wrong_penalty: null, point_per_net: 1.25 })[0].points, 15)
})
