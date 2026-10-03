import test from 'node:test'
import assert from 'node:assert/strict'
import { createPasswordHandler } from '../supabase/functions/admin-change-password/handler.ts'
const adminId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const password = 'test-password-123'
function setup(options = {}) {
  const writes = [], tokens = [], roles = []
  const handle = createPasswordHandler({
    async getVerifiedUser(token) { tokens.push(token); return options.invalidToken ? null : { id: adminId } },
    async getRole(id) { roles.push(id); if (options.throwRole) throw new Error('secret database information'); return id === adminId ? options.callerRole || 'admin' : options.missing ? null : options.targetRole || 'user' },
    async updatePassword(id, value) { writes.push({ id, value }); return options.updateError || null },
  })
  return { handle, writes, tokens, roles }
}
const request = (body = { userId, password }, headers = {}, method = 'POST') => new Request('https://example.test/admin-change-password', { method, headers: { Authorization: 'Bearer verified-token', 'Content-Type': 'application/json', ...headers }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) })
test('verified admin can set only the selected user password; response contains no password', async () => {
  const state = setup(); const response = await state.handle(request())
  assert.equal(response.status, 200); assert.deepEqual(state.writes, [{ id: userId, value: password }])
  assert.deepEqual(state.tokens, ['verified-token']); assert.deepEqual(state.roles, [adminId, userId])
  assert.deepEqual(await response.json(), { success: true }); assert.equal(response.headers.get('Cache-Control'), 'no-store')
})
test('anonymous and invalid sessions cannot write', async () => {
  for (const [options, headers] of [[{}, { Authorization: '' }], [{ invalidToken: true }, {}]]) {
    const state = setup(options); assert.equal((await state.handle(request(undefined, headers))).status, 401); assert.equal(state.writes.length, 0)
  }
})
test('browser supplied admin roles and IDs cannot grant privileges', async () => {
  const state = setup({ callerRole: 'user' })
  assert.equal((await state.handle(request({ userId, password, role: 'admin', callerId: adminId, isAdmin: true }))).status, 403)
  assert.equal(state.writes.length, 0); assert.deepEqual(state.roles, [adminId])
})
test('admin targets, self and missing users cannot be modified', async () => {
  for (const [options, target, status] of [[{ targetRole: 'admin' }, userId, 403], [{}, adminId, 403], [{ missing: true }, userId, 404]]) {
    const state = setup(options); assert.equal((await state.handle(request({ userId: target, password }))).status, status); assert.equal(state.writes.length, 0)
  }
})
test('invalid payloads and passwords fail before updating auth', async () => {
  for (const body of ['bad-json', null, [], { userId: 'invalid', password }, { userId, password: 'short' }, { userId, password: ' '.repeat(8) }, { userId, password: 'x'.repeat(129) }]) {
    const state = setup(); assert.equal((await state.handle(request(body))).status, 400); assert.equal(state.writes.length, 0)
  }
})
test('preflight succeeds without auth checks and unsupported methods do not write', async () => {
  const state = setup()
  assert.equal((await state.handle(request(undefined, {}, 'OPTIONS'))).status, 204)
  assert.equal((await state.handle(request(undefined, {}, 'GET'))).status, 405)
  assert.equal(state.tokens.length, 0); assert.equal(state.writes.length, 0)
})
test('oversized and non-JSON requests do not mutate passwords', async () => {
  for (const [headers, status] of [[{ 'Content-Type': 'text/plain' }, 415], [{ 'Content-Length': '99999' }, 413]]) {
    const state = setup(); assert.equal((await state.handle(request(undefined, headers))).status, status); assert.equal(state.writes.length, 0)
  }
})
test('backend failures never expose privileged error details or claim success', async () => {
  const state = setup({ throwRole: true }); const response = await state.handle(request())
  assert.equal(response.status, 500); assert.ok(!(await response.text()).includes('secret')); assert.equal(state.writes.length, 0)
  const failed = setup({ updateError: { code: 'weak_password' } }); const failure = await failed.handle(request())
  assert.equal(failure.status, 400); assert.equal((await failure.json()).success, undefined)
})
