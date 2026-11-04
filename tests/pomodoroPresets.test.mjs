import test from 'node:test'
import assert from 'node:assert/strict'
import { readPomodoroPreferences, validatePomodoroPreferences, pomodoroChoices, selectedPomodoro, pomodoroMode, removePomodoroPreset } from '../src/lib/pomodoroPresets.ts'
const settings = { long_focus_minutes: 50, long_break_minutes: 10, short_focus_minutes: 25, short_break_minutes: 5 }
const custom = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: ' Derin çalışma ', focusMinutes: 60, breakMinutes: 0 }
const preferences = { presets: [custom], selectedId: custom.id }

test('saved custom choice round-trips without overwriting builtin durations or source metadata', () => {
  const before = structuredClone(preferences)
  const saved = validatePomodoroPreferences(preferences)
  const restored = readPomodoroPreferences(JSON.parse(JSON.stringify(saved)))
  assert.equal(selectedPomodoro(settings, restored).focusMinutes, 60)
  assert.equal(selectedPomodoro(settings, restored).breakMinutes, 0)
  assert.equal(selectedPomodoro(settings, restored).name, 'Derin çalışma')
  assert.deepEqual(pomodoroChoices(settings, restored).map(p => [p.id, p.focusMinutes, p.breakMinutes]), [['short',25,5], ['long',50,10], [custom.id,60,0]])
  assert.equal(pomodoroMode(custom.id), 'pomodoro_long')
  assert.equal(pomodoroMode('short'), 'pomodoro_short')
  assert.deepEqual(preferences, before)
})
test('new and malformed accounts fall back to builtin timers; invalid writes are rejected', () => {
  for (const input of [undefined, null, {}, { ...preferences, selectedId: 'missing' }, { ...preferences, presets: [custom, custom] }, { ...preferences, presets: [{ ...custom, id: 'long' }] }]) {
    assert.deepEqual(readPomodoroPreferences(input), { presets: [], selectedId: 'long' })
    assert.throws(() => validatePomodoroPreferences(input))
  }
  assert.equal(selectedPomodoro(settings, readPomodoroPreferences(undefined)).focusMinutes, 50)
  for (const patch of [{ focusMinutes: 0 }, { focusMinutes: 181 }, { focusMinutes: 1.5 }, { focusMinutes: NaN }, { breakMinutes: -1 }, { breakMinutes: 61 }, { breakMinutes: 0.5 }, { name: ' ' }, { name: 'a'.repeat(41) }]) {
    assert.throws(() => validatePomodoroPreferences({ ...preferences, presets: [{ ...custom, ...patch }] }))
  }
  assert.doesNotThrow(() => validatePomodoroPreferences({ ...preferences, presets: [{ ...custom, focusMinutes: 180, breakMinutes: 60 }] }))
})
test('deleting the chosen preset falls back to long; removing others preserves the choice', () => {
  const other = { ...custom, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Kısa tekrar' }
  const source = { presets: [custom, other], selectedId: custom.id }
  assert.equal(removePomodoroPreset(source, other.id).selectedId, custom.id)
  const deleted = removePomodoroPreset(source, custom.id)
  assert.equal(deleted.selectedId, 'long')
  assert.equal(selectedPomodoro(settings, deleted).focusMinutes, 50)
  assert.equal(source.presets.length, 2)
})
test('a full preset list can be edited but adding a twenty-first preset fails', () => {
  const presets = Array.from({ length: 20 }, (_, i) => ({ ...custom, id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }))
  assert.doesNotThrow(() => validatePomodoroPreferences({ presets, selectedId: presets[19].id }))
  assert.throws(() => validatePomodoroPreferences({ presets: [...presets, custom], selectedId: custom.id }))
})
