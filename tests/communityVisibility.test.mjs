import test from 'node:test'
import assert from 'node:assert/strict'
import { communityPreferences, communityBoard, communitySettingsError } from '../src/lib/communityVisibility.ts'

const entry = { user_id: 'alice', display_name: 'Kullanıcı', email: 'alice@example.test', message: 'Bugün devam!', total: 60, details: { 'Sözel — Kaynak': 60 } }
const board = { show_widget: true, share_statistics: true, daily_message: 'Notum', entries: [entry] }

test('widget access and participation are independent boolean preferences', () => {
  for (const show_widget of [true, false]) for (const share_statistics of [true, false]) {
    assert.deepEqual(communityPreferences({ user_id: 'alice', show_widget, share_statistics }), { user_id: 'alice', show_widget, share_statistics })
  }
  for (const malformed of [null, {}, { user_id: 'alice', show_widget: 'false', share_statistics: false }]) assert.throws(() => communityPreferences(malformed))
})
test('a hidden widget never renders participant data, even if a stale payload includes it', () => {
  assert.deepEqual(communityBoard({ ...board, show_widget: false }, 'alice').entries, [])
  assert.equal(communityBoard({ ...board, show_widget: false }, 'alice').show_widget, false)
})
test('a user excluded from sharing can still view other participants', () => {
  const result = communityBoard({ ...board, share_statistics: false }, 'bob')
  assert.equal(result.show_widget, true)
  assert.equal(result.share_statistics, false)
  assert.equal(result.entries.length, 1)
})
test('ranking preserves daily totals, details, messages and verified own-name fallback', () => {
  const result = communityBoard(board, 'alice', 'Ayşe')
  assert.equal(result.entries[0].name, 'Ayşe')
  assert.equal(result.entries[0].total, 60)
  assert.deepEqual(result.entries[0].details, entry.details)
  assert.equal(result.entries[0].message, entry.message)
  assert.equal(result.daily_message, 'Notum')
  assert.equal(communityBoard(board, 'bob', 'Başka kişi').entries[0].name, 'alice')
})
test('missing or malformed permission payloads fail closed instead of enabling the widget', () => {
  for (const malformed of [null, {}, { ...board, show_widget: 'true' }, { ...board, entries: [{ ...entry, total: NaN }] }, { ...board, entries: [{ ...entry, details: { ders: '60' } }] }]) {
    assert.throws(() => communityBoard(malformed, 'alice'))
  }
})
test('schema/permission errors are actionable and never echo untrusted server messages', () => {
  assert.match(communitySettingsError({ code: 'PGRST202' }), /community_visibility\.sql/)
  assert.match(communitySettingsError({ code: '42501' }), /yönetici/)
  assert.doesNotMatch(communitySettingsError({ message: '<script>secret</script>' }), /script|secret/)
})
