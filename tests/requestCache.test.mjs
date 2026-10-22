import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequestCache } from '../src/lib/requestCache.ts'
const url = 'https://project.supabase.co/rest/v1/subjects?select=*&user_id=eq.owner'
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
const auth = (token = 'owner-token') => ({ headers: { Authorization: `Bearer ${token}` } })

test('simultaneous identical reads share one request and each response remains independently readable', async () => {
  let calls = 0, release
  const gate = new Promise(resolve => { release = resolve })
  const cache = createRequestCache(async () => { calls++; await gate; return json([{ id: 'subject' }]) })
  const first = cache.fetch(url, auth()), second = cache.fetch(url, auth())
  release()
  assert.deepEqual(await (await first).json(), [{ id: 'subject' }])
  assert.deepEqual(await (await second).json(), [{ id: 'subject' }])
  assert.deepEqual(await (await cache.fetch(url, auth())).json(), [{ id: 'subject' }])
  assert.equal(calls, 1)
})

test('account tokens, target users, range and representation headers never share cached rows', async () => {
  let calls = 0
  const cache = createRequestCache(async () => json({ call: ++calls }))
  for (const [target, options] of [[url, auth()], [url, auth('another-user')], [url + '2', auth()], [url, { headers: { ...auth().headers, Range: '0-49' } }], [url, { headers: { ...auth().headers, Accept: 'application/vnd.pgrst.object+json' } }]]) await cache.fetch(target, options)
  assert.equal(calls, 5)
})

test('TTL and bounded memory evict old responses; explicit invalidation forces a fresh read', async () => {
  let clock = 0, calls = 0
  const cache = createRequestCache(async () => json(++calls), { now: () => clock, ttlMs: 30, maxEntries: 1 })
  await cache.fetch(url); await cache.fetch(url)
  assert.equal(calls, 1)
  clock = 31; await cache.fetch(url)
  assert.equal(calls, 2)
  await cache.fetch(url + '&page=2'); await cache.fetch(url)
  assert.equal(calls, 4)
  cache.clear(); await cache.fetch(url)
  assert.equal(calls, 5)
})

test('every mutation invalidates previous reads, including failed and uncertain writes', async () => {
  let reads = 0
  const cache = createRequestCache(async (_url, options) => {
    if (options?.method === 'PATCH') throw new Error('network interrupted')
    return json(++reads)
  })
  await cache.fetch(url)
  await assert.rejects(cache.fetch(url, { method: 'PATCH', body: '{}' }), /interrupted/)
  assert.equal(await (await cache.fetch(url)).json(), 2)
})

test('an old in-flight read cannot repopulate the cache after a write', async () => {
  let release, calls = 0
  const gate = new Promise(resolve => { release = resolve })
  const cache = createRequestCache(async (_url, options) => {
    if (options?.method === 'POST') return json({ written: true })
    calls++; if (calls === 1) { await gate; return json('old') }
    return json('new')
  })
  const old = cache.fetch(url)
  await cache.fetch(url, { method: 'POST', body: '{}' })
  release(); await old
  assert.equal(await (await cache.fetch(url)).json(), 'new')
  assert.equal(calls, 2)
})

test('permission-check RPCs coalesce only while in flight and never reuse completed authorization checks', async () => {
  let calls = 0, release
  const gate = new Promise(resolve => { release = resolve })
  const cache = createRequestCache(async () => { calls++; await gate; return json([]) })
  const endpoint = 'https://project.supabase.co/rest/v1/rpc/get_accessible_monthly_plans'
  const options = { ...auth(), method: 'POST', body: '{}' }
  const first = cache.fetch(endpoint, options), second = cache.fetch(endpoint, options)
  release(); await Promise.all([first, second])
  assert.equal(calls, 1)
  await cache.fetch(endpoint, options)
  assert.equal(calls, 2)
})

test('failed reads, auth endpoints, explicit no-store and caller cancellation bypass response reuse', async () => {
  let calls = 0
  const cache = createRequestCache(async () => new Response(String(++calls), { status: calls <= 2 ? 503 : 200 }))
  await cache.fetch(url); await cache.fetch(url)
  assert.equal(calls, 2)
  await cache.fetch('https://project.supabase.co/auth/v1/user'); await cache.fetch('https://project.supabase.co/auth/v1/user')
  await cache.fetch(url, { cache: 'no-store' }); await cache.fetch(url, { signal: new AbortController().signal })
  assert.equal(calls, 6)
})


test('duplicate timer ticks do not notify the entire study workspace or rewrite its snapshot', async () => {
  const { useTimerStore } = await import('../src/lib/timerStore.ts')
  let updates = 0
  const unsubscribe = useTimerStore.subscribe(() => updates++)
  useTimerStore.getState().setSecondsLeft(17)
  useTimerStore.getState().setSecondsLeft(17)
  assert.equal(updates, 1)
  unsubscribe()
})


test('server no-store responses are never retained in the tab cache', async () => {
  let calls = 0
  const cache = createRequestCache(async () => new Response(String(++calls), { headers: { 'cache-control': 'private, no-store' } }))
  await cache.fetch(url); await cache.fetch(url)
  assert.equal(calls, 2)
})
