import test from 'node:test'
import assert from 'node:assert/strict'
import { actualProfileName, profileNameLabel } from '../src/lib/profileName.ts'
test('default labels do not mask a real name in auth metadata', () => {
  for (const placeholder of ['Kullanıcı', 'KULLANICI', 'Kullanici', 'User', 'İsimsiz', '', null]) {
    assert.equal(actualProfileName(placeholder, '  Ayşe  Yılmaz  '), 'Ayşe Yılmaz')
  }
})
test('a real profile name wins over stale auth metadata', () => {
  assert.equal(actualProfileName('Süleyman', 'Old name'), 'Süleyman')
  assert.equal(actualProfileName(undefined, { role: 'admin' }, 'Mert'), 'Mert')
})
test('unknown accounts are identifiable without inventing a personal name', () => {
  assert.equal(profileNameLabel('Kullanıcı', 'ayse@example.com'), 'ayse')
  assert.equal(profileNameLabel(null), 'Ad belirtilmemiş')
  assert.equal(actualProfileName(' Kullanıcı '), null)
})
