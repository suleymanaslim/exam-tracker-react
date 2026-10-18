import test from 'node:test'
import assert from 'node:assert/strict'
import { resetVideoProgress, videoProgressResetError } from '../src/lib/videoProgressReset.ts'

function mock(options = {}) {
  const calls = []
  const client = { from(table) {
    calls.push(['from', table])
    let kind = ''
    const query = {
      update(values) { kind = 'update'; calls.push(['update', values]); return query },
      select(columns, settings) { kind = 'verify'; calls.push(['select', columns, settings]); return query },
      eq(key, value) { calls.push([kind, 'eq', key, value]); return query },
      or(filter) { calls.push(['or', filter]); return query },
      then(resolve, reject) { return Promise.resolve(kind === 'update' ? { error: options.writeError || null } : { error: options.readError || null, count: options.remaining === undefined ? 0 : options.remaining }).then(resolve, reject) },
    }
    return query
  } }
  return { client, calls }
}
test('only one owner/resource watch state is reset; plans and study data are untouched', async () => {
  const { client, calls } = mock()
  await resetVideoProgress(client, 'alice', 'video-a')
  assert.deepEqual(calls.filter(c => c[0] === 'from'), [['from','video_plan_items'],['from','video_plan_items']])
  assert.deepEqual(calls.find(c => c[0] === 'update'), ['update',{ watched_count: 0, is_completed: false }])
  for (const kind of ['update','verify']) {
    assert.ok(calls.some(c => JSON.stringify(c) === JSON.stringify([kind,'eq','user_id','alice'])))
    assert.ok(calls.some(c => JSON.stringify(c) === JSON.stringify([kind,'eq','resource_id','video-a'])))
  }
  assert.deepEqual(calls.find(c => c[0] === 'select'), ['select','id',{ head: true, count: 'exact' }])
  assert.deepEqual(calls.at(-1), ['or','watched_count.gt.0,is_completed.eq.true'])
})
test('missing ownership/resource identifiers cannot issue an unscoped update', async () => {
  for (const [owner, resource] of [['','video-a'],['alice','']]) {
    const { client, calls } = mock()
    await assert.rejects(resetVideoProgress(client, owner, resource))
    assert.equal(calls.length,0)
  }
})
test('permission failures never claim success or continue to verification', async () => {
  const denied = { code: '42501' }, { client, calls } = mock({ writeError: denied })
  await assert.rejects(resetVideoProgress(client,'alice','video-a'), error => error === denied)
  assert.equal(calls.filter(c => c[0] === 'from').length,1)
})
test('a silent RLS denial or incomplete reset fails verification instead of clearing the UI', async () => {
  for (const remaining of [1, 1500, null]) {
    const { client } = mock({ remaining })
    await assert.rejects(resetVideoProgress(client,'alice','video-a'), /verified/)
  }
  const error = new TypeError('Connection lost'), { client } = mock({ readError: error })
  await assert.rejects(resetVideoProgress(client,'alice','video-a'), actual => actual === error)
})
test('reset messages explain permission errors without echoing server content', () => {
  assert.match(videoProgressResetError({ code: '42501' }), /izni/)
  assert.doesNotMatch(videoProgressResetError({ message: '<script>secret</script>' }), /script|secret/)
})
