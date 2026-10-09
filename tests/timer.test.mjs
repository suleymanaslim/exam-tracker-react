import test from 'node:test'
import assert from 'node:assert/strict'
import { bindTimerOwner, useTimerStore } from '../src/lib/timerStore.ts'
import { recoveryFor, readTimerSnapshot, sessionPayload } from '../src/lib/timerRecovery.ts'
import { playlistURL, nextFocusVideo, FOCUS_VIDEO_IDS } from '../src/lib/playlist.ts'

const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
}
const realNow = Date.now
let clock = realNow()
Date.now = () => clock
function start(owner = 'alice') {
  bindTimerOwner(null)
  storage.clear()
  bindTimerOwner(owner)
  const timer = useTimerStore.getState()
  timer.setSelExam('exam')
  timer.setSelSubject('subject')
  timer.setSelResource('resource')
  timer.resetTimer(1500)
  timer.startTimer()
}
function reopen(owner = 'alice') { bindTimerOwner(null); bindTimerOwner(owner) }
function stored(owner = 'alice') { return JSON.parse(storage.get(`examtracker-timer-v1:${owner}`)) }

test('an open tab keeps its active session without confirmation', () => {
  start()
  const id = useTimerStore.getState().sessionId
  clock += 600000
  bindTimerOwner('alice')
  assert.equal(useTimerStore.getState().isRunning, true)
  assert.equal(useTimerStore.getState().recovery, null)
  assert.equal(useTimerStore.getState().sessionId, id)
})
test('reopening pauses for confirmation and preserves the remaining time', () => {
  start()
  clock += 600000
  reopen()
  const state = useTimerStore.getState()
  assert.equal(state.isRunning, false)
  assert.equal(state.secondsLeft, 900)
  assert.equal(state.recovery.durationMinutes, 10)
  assert.equal(state.recovery.remainingSeconds, 900)
})
test('late reopening caps the recorded duration and end time at the deadline', () => {
  start()
  const deadline = useTimerStore.getState().deadlineEpoch
  clock += 3 * 3600000
  reopen()
  const recovery = useTimerStore.getState().recovery
  assert.equal(recovery.durationMinutes, 25)
  assert.equal(recovery.remainingSeconds, 0)
  assert.equal(Date.parse(recovery.endedAt), deadline)
})
test('closing during completion preserves a stable confirmation ID for an insert retry', () => {
  start(); clock += 1500000
  const id = useTimerStore.getState().sessionId
  useTimerStore.getState().pauseTimer()
  reopen()
  assert.equal(useTimerStore.getState().recovery.id, id)
  assert.equal(useTimerStore.getState().recovery.durationMinutes, 25)
})
test('paused timers do not accumulate time while closed', () => {
  start(); clock += 300000
  useTimerStore.getState().pauseTimer()
  clock += 7200000; reopen()
  assert.equal(useTimerStore.getState().secondsLeft, 1200)
  assert.equal(useTimerStore.getState().isRunning, false)
  assert.equal(useTimerStore.getState().recovery, null)
})
test('confirmation carries fractional minutes forward without recording them twice', () => {
  start(); clock += 620000; reopen()
  const previous = useTimerStore.getState().recovery
  useTimerStore.getState().resolveRecovery(true)
  const continued = useTimerStore.getState()
  assert.equal(previous.durationMinutes, 10)
  assert.equal(continued.secondsLeft, 880)
  assert.equal(continued.totalSeconds, 900)
  assert.equal(continued.focusSeconds, 1500)
  assert.notEqual(continued.sessionId, previous.id)
  clock += 880000
  const completed = recoveryFor(stored(), clock)
  assert.equal(previous.durationMinutes + completed.durationMinutes, 25)
})
test('denial resets the timer without turning it into a completed session', () => {
  start(); clock += 600000; reopen()
  useTimerStore.getState().resolveRecovery(false)
  const state = useTimerStore.getState()
  assert.equal(state.recovery, null)
  assert.equal(state.startedAt, null)
  assert.equal(state.secondsLeft, 1500)
  assert.equal(state.isRunning, false)
})
test('deferred decisions keep the same insert ID and frozen duration across reloads', () => {
  start(); clock += 600000; reopen()
  const first = sessionPayload(useTimerStore.getState().recovery)
  clock += 600000; reopen()
  assert.deepEqual(sessionPayload(useTimerStore.getState().recovery), first)
})
test('account switching does not reuse another user’s selections or session', () => {
  start(); clock += 600000
  bindTimerOwner('bob')
  assert.equal(useTimerStore.getState().ownerId, 'bob')
  assert.equal(useTimerStore.getState().selSubject, '')
  assert.equal(useTimerStore.getState().sessionId, null)
  bindTimerOwner('alice')
  assert.equal(useTimerStore.getState().recovery.ownerId, 'alice')
  assert.equal(useTimerStore.getState().recovery.durationMinutes, 10)
})
test('completed breaks reopen ready for focus without asking to record break time', () => {
  start(); useTimerStore.getState().finishFocus()
  clock += 700000; reopen()
  assert.equal(useTimerStore.getState().phase, 'focus')
  assert.equal(useTimerStore.getState().secondsLeft, 1500)
  assert.equal(useTimerStore.getState().recovery, null)
  assert.equal(useTimerStore.getState().isRunning, false)
})
test('simulated focus end only moves the timer into a break', () => {
  start()
  useTimerStore.getState().finishFocus()
  const state = useTimerStore.getState()
  assert.equal(state.phase, 'break')
  assert.equal(state.startedAt, null)
  assert.equal(state.sessionId, null)
  assert.equal(state.recovery, null)
  assert.equal(state.secondsLeft, 600)
})
test('invalid or foreign stored snapshots are ignored', () => {
  start()
  assert.equal(readTimerSnapshot(storage.get('examtracker-timer-v1:alice'), 'bob'), null)
  assert.equal(readTimerSnapshot('{broken', 'alice'), null)
  const invalid = { ...stored(), totalSeconds: -1 }
  assert.equal(readTimerSnapshot(JSON.stringify(invalid), 'alice'), null)
})
test('playlist links only allow normal HTTP(S) URLs without credentials', () => {
  assert.equal(playlistURL('javascript:alert(1)'), null)
  assert.equal(playlistURL('data:text/html,test'), null)
  assert.equal(playlistURL('https://user:pass@example.com/'), null)
  assert.equal(playlistURL('not a URL'), null)
  assert.equal(playlistURL('  https://youtube.com/playlist?list=123 '), 'https://youtube.com/playlist?list=123')
})
test('random video selection always uses the provided pool and avoids immediate repeats', () => {
  for (const previous of FOCUS_VIDEO_IDS) {
    for (const seed of [0, .25, .5, .75, .999]) {
      const next = nextFocusVideo(previous, () => seed)
      assert.ok(FOCUS_VIDEO_IDS.includes(next))
      assert.notEqual(next, previous)
    }
  }
})
process.on('exit', () => { Date.now = realNow })

function startStopwatch() {
  start()
  useTimerStore.getState().pauseTimer()
  useTimerStore.getState().setMode('stopwatch')
  useTimerStore.getState().resetTimer(0)
  useTimerStore.getState().startTimer()
}
test('stopwatch counts upward and saves seconds including a sub-minute session', () => {
  startStopwatch(); clock += 37000
  const session = recoveryFor(stored(), clock)
  assert.equal(session.remainingSeconds, 37)
  assert.equal(session.durationMinutes, 37 / 60)
  assert.equal(sessionPayload(session).session_type, 'manual')
  assert.equal(Date.parse(session.endedAt) - Date.parse(session.startedAt), 37000)
})
test('stopwatch pause and resume exclude paused time and keep the same session', () => {
  startStopwatch(); clock += 65000
  useTimerStore.getState().pauseTimer()
  const id = useTimerStore.getState().sessionId
  clock += 3600000
  assert.equal(recoveryFor(stored(), clock).remainingSeconds, 65)
  useTimerStore.getState().startTimer(); clock += 27000
  assert.equal(recoveryFor(stored(), clock).remainingSeconds, 92)
  assert.equal(useTimerStore.getState().sessionId, id)
})
test('stopwatch reopening confirms elapsed time once and finishes without a break', () => {
  startStopwatch(); clock += 72037000; reopen()
  const session = useTimerStore.getState().recovery
  assert.equal(session.remainingSeconds, 72037)
  assert.equal(useTimerStore.getState().isRunning, false)
  clock += 3600000; reopen()
  assert.equal(useTimerStore.getState().recovery.id, session.id)
  assert.equal(useTimerStore.getState().recovery.remainingSeconds, 72037)
  useTimerStore.getState().resolveRecovery(true)
  assert.equal(useTimerStore.getState().phase, 'focus')
  assert.equal(useTimerStore.getState().secondsLeft, 0)
  assert.equal(useTimerStore.getState().startedAt, null)
})
test('paused stopwatch survives reload without including closed time', () => {
  startStopwatch(); clock += 46000; useTimerStore.getState().pauseTimer()
  clock += 500000; reopen()
  assert.equal(useTimerStore.getState().secondsLeft, 46)
  assert.equal(useTimerStore.getState().recovery, null)
  assert.equal(useTimerStore.getState().isRunning, false)
})

test('a question task starts counting up immediately and preserves task selection after reopen', () => {
  bindTimerOwner(null); storage.clear(); bindTimerOwner('alice')
  const planId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  useTimerStore.getState().startQuestions({ examId: 'ags', subjectId: 'verbal', resourceId: 'video', planId, date: '2026-10-09' })
  assert.equal(useTimerStore.getState().mode, 'questions')
  assert.equal(useTimerStore.getState().isRunning, true)
  clock += 83000; reopen()
  const session = useTimerStore.getState().recovery
  assert.equal(session.questionPlanId, planId)
  assert.equal(session.subjectId, 'verbal')
  assert.equal(session.remainingSeconds, 83)
  assert.equal(session.durationMinutes, 83 / 60)
})
test('extra questions need no video task and cannot replace an active or paused session', () => {
  bindTimerOwner(null); storage.clear(); bindTimerOwner('alice')
  useTimerStore.getState().startQuestions({ examId: 'yds', subjectId: 'english', date: '2026-10-09' })
  const id = useTimerStore.getState().sessionId
  assert.equal(useTimerStore.getState().questionPlanId, null)
  clock += 45000; useTimerStore.getState().pauseTimer()
  useTimerStore.getState().startQuestions({ examId: 'ags', subjectId: 'math', date: '2026-10-09' })
  assert.equal(useTimerStore.getState().sessionId, id)
  assert.equal(useTimerStore.getState().selSubject, 'english')
  clock += 3600000; reopen()
  assert.equal(useTimerStore.getState().secondsLeft, 45)
  useTimerStore.getState().startTimer(); clock += 5000
  assert.equal(recoveryFor(stored(), clock).remainingSeconds, 50)
})
test('question save failures retain frozen counts, optional answers and UUID across reloads', () => {
  bindTimerOwner(null); storage.clear(); bindTimerOwner('alice')
  useTimerStore.getState().startQuestions({ examId: 'ags', subjectId: 'verbal', date: '2026-10-09' })
  clock += 90000; useTimerStore.getState().pauseTimer()
  const session = recoveryFor(stored(), clock)
  useTimerStore.setState({ recovery: { ...session, solvedQuestions: 30, correctQuestions: 22, wrongQuestions: 5, reason: 'save-failed' } })
  clock += 500000; reopen()
  const restored = useTimerStore.getState().recovery
  assert.equal(restored.id, session.id)
  assert.equal(restored.remainingSeconds, 90)
  assert.equal(restored.solvedQuestions, 30)
  assert.equal(restored.correctQuestions, 22)
  assert.equal(restored.wrongQuestions, 5)
  useTimerStore.getState().resolveRecovery(true)
  assert.equal(useTimerStore.getState().isRunning, false)
  assert.equal(useTimerStore.getState().secondsLeft, 0)
  assert.equal(useTimerStore.getState().questionPlanId, null)
  assert.equal(useTimerStore.getState().phase, 'focus')
})
test('question recovery is not blocked by a finishing dialog after changing account or reloading', () => {
  bindTimerOwner(null); storage.clear(); bindTimerOwner('alice')
  useTimerStore.getState().startQuestions({ examId: 'ags', subjectId: 'verbal', date: '2026-10-09' })
  clock += 50000
  useTimerStore.setState({ isFinishing: true })
  bindTimerOwner('bob')
  useTimerStore.setState({ isFinishing: true })
  bindTimerOwner('alice')
  assert.equal(useTimerStore.getState().isFinishing, false)
  assert.equal(useTimerStore.getState().recovery.remainingSeconds, 50)
  assert.equal(useTimerStore.getState().recovery.ownerId, 'alice')
})
