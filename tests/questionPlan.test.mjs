import test from 'node:test'
import assert from 'node:assert/strict'
import { QUESTION_PRESETS, questionCount, questionAnswers, completedVideo, withQuestionProgress, openQuestionPlans } from '../src/lib/questionPlan.ts'
import { questionSessionPayload } from '../src/lib/questionSession.ts'

test('question presets and custom counts accept only whole numbers in range', () => {
  assert.deepEqual(QUESTION_PRESETS, [15, 20, 30, 45])
  for (const value of [15, '20', ' 73 ']) assert.ok(questionCount(value) > 0)
  for (const value of [0, -1, 1.5, '15.5', '15abc', '', ' ', null, 100001, Infinity, true]) assert.equal(questionCount(value), null)
  assert.equal(questionCount('0', true), 0)
})
test('video watch status remains independent from question goal eligibility', () => {
  assert.equal(completedVideo({ video_count: 3, watched_count: 2 }), false)
  assert.equal(completedVideo({ video_count: 3, watched_count: 3 }), true)
  assert.equal(completedVideo({ video_count: 3, is_completed: true }), true)
  assert.equal(completedVideo({ video_count: 0, watched_count: 0 }), false)
})
test('optional answers stay unknown when omitted and cannot exceed solved total', () => {
  assert.deepEqual(questionAnswers('30'), { solved_questions: 30, correct_questions: null, wrong_questions: null })
  assert.deepEqual(questionAnswers('30', '20', '5'), { solved_questions: 30, correct_questions: 20, wrong_questions: 5 })
  assert.deepEqual(questionAnswers('0', '0', '0'), { solved_questions: 0, correct_questions: 0, wrong_questions: 0 })
  assert.equal(questionAnswers(20, 15, 10), null)
  assert.equal(questionAnswers(20, -1), null)
  assert.equal(questionAnswers(20, '1.5'), null)
})
test('manual and timed results accumulate per plan; extra solved questions are not capped at target', () => {
  const plans = [{ id: 'a', target_questions: 30 }, { id: 'b', target_questions: 20 }]
  const results = [{ question_plan_id: 'a', solved_questions: 25, correct_questions: 20, wrong_questions: 5 }, { question_plan_id: 'a', solved_questions: 20 }, { question_plan_id: 'b', solved_questions: 0, correct_questions: 0, wrong_questions: 0 }]
  const before = structuredClone(plans)
  const progress = withQuestionProgress(plans, results)
  assert.equal(progress[0].solved_questions, 45)
  assert.equal(progress[0].correct_questions, 20)
  assert.equal(progress[0].answers_recorded, true)
  assert.equal(progress[1].solved_questions, 0)
  assert.equal(progress[1].answers_recorded, true)
  assert.deepEqual(plans, before)
})
test('today includes completed tasks; overdue unfinished targets remain and future tasks wait', () => {
  const plans = [
    { id: 'today', date: '2026-10-09', target_questions: 20, solved_questions: 25 },
    { id: 'overdue', date: '2026-10-08', target_questions: 30, solved_questions: 20 },
    { id: 'done', date: '2026-10-08', target_questions: 30, solved_questions: 30 },
    { id: 'extra', date: '2026-10-08', target_questions: null, solved_questions: 15 },
    { id: 'future', date: '2026-10-10', target_questions: 30, solved_questions: 0 },
  ]
  assert.deepEqual(openQuestionPlans(plans, '2026-10-09').map(plan => plan.id), ['today', 'overdue'])
})
test('question session payload keeps stable IDs, exact time and counts for atomic retries', () => {
  const session = { id: 'session-id', ownerId: 'alice', subjectId: 'subject', resourceId: 'video-resource', mode: 'questions', questionPlanId: 'question-plan', questionDate: '2026-10-09', startedAt: '2026-10-09T11:00:00Z', endedAt: '2026-10-09T11:01:07Z', durationMinutes: 67 / 60, remainingSeconds: 67, solvedQuestions: 20, correctQuestions: 15, wrongQuestions: 5 }
  const payload = questionSessionPayload(session)
  assert.equal(payload.p_questions, 20)
  assert.equal(payload.p_duration_minutes, 67 / 60)
  assert.equal(payload.p_question_plan_id, 'question-plan')
  assert.equal(payload.p_user_id, 'alice')
  assert.equal(payload.p_session_id, 'session-id')
  assert.deepEqual(questionSessionPayload(structuredClone(session)), payload)
  assert.equal(questionSessionPayload({ ...session, questionPlanId: null }).p_question_plan_id, null)
  assert.throws(() => questionSessionPayload({ ...session, solvedQuestions: undefined }))
  assert.throws(() => questionSessionPayload({ ...session, correctQuestions: 21 }))
  assert.throws(() => questionSessionPayload({ ...session, durationMinutes: 0 }))
})
