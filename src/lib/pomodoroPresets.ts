export interface PomodoroPreset { id: string; name: string; focusMinutes: number; breakMinutes: number }
export interface PomodoroPreferences { presets: PomodoroPreset[]; selectedId: string }
export interface PomodoroDurations { long_focus_minutes: number; long_break_minutes: number; short_focus_minutes: number; short_break_minutes: number }
export const DEFAULT_POMODORO_PREFERENCES: PomodoroPreferences = { presets: [], selectedId: 'long' }
export const MAX_POMODORO_PRESETS = 20
const validId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export function validatePomodoroPreferences(value: unknown): PomodoroPreferences {
  const preferences = value as PomodoroPreferences
  if (!preferences || !Array.isArray(preferences.presets) || preferences.presets.length > MAX_POMODORO_PRESETS) throw new Error('En fazla 20 hazır sayaç ekleyebilirsin.')
  const ids = new Set<string>()
  const presets = preferences.presets.map(preset => {
    if (!preset || !validId(preset.id) || ids.has(preset.id)) throw new Error('Sayaç kimliği geçersiz.')
    ids.add(preset.id)
    if (typeof preset.name !== 'string' || !preset.name.trim() || preset.name.trim().length > 40) throw new Error('Sayaç adı 1–40 karakter olmalı.')
    if (!Number.isInteger(preset.focusMinutes) || preset.focusMinutes < 1 || preset.focusMinutes > 180) throw new Error('Odak süresi 1–180 dakika arasında bir tam sayı olmalı.')
    if (!Number.isInteger(preset.breakMinutes) || preset.breakMinutes < 0 || preset.breakMinutes > 60) throw new Error('Mola süresi 0–60 dakika arasında bir tam sayı olmalı.')
    return { id: preset.id, name: preset.name.trim(), focusMinutes: preset.focusMinutes, breakMinutes: preset.breakMinutes }
  })
  if (!['long', 'short', ...ids].includes(preferences.selectedId)) throw new Error('Seçili sayaç bulunamadı.')
  return { presets, selectedId: preferences.selectedId }
}
export function readPomodoroPreferences(value: unknown): PomodoroPreferences {
  try { return validatePomodoroPreferences(value) } catch { return { presets: [], selectedId: 'long' } }
}
export function pomodoroChoices(settings: PomodoroDurations, preferences: PomodoroPreferences): PomodoroPreset[] {
  return [
    { id: 'short', name: 'Kısa Pomodoro', focusMinutes: settings.short_focus_minutes, breakMinutes: settings.short_break_minutes },
    { id: 'long', name: 'Uzun Pomodoro', focusMinutes: settings.long_focus_minutes, breakMinutes: settings.long_break_minutes },
    ...preferences.presets,
  ]
}
export function selectedPomodoro(settings: PomodoroDurations, preferences: PomodoroPreferences) {
  return pomodoroChoices(settings, preferences).find(preset => preset.id === preferences.selectedId)!
}
export const pomodoroMode = (id: string) => id === 'short' ? 'pomodoro_short' as const : 'pomodoro_long' as const
export const pomodoroLabel = (preset: PomodoroPreset) => `${preset.name} · ${preset.focusMinutes} dk / ${preset.breakMinutes} dk mola`
export function removePomodoroPreset(preferences: PomodoroPreferences, id: string): PomodoroPreferences {
  return { presets: preferences.presets.filter(preset => preset.id !== id), selectedId: preferences.selectedId === id ? 'long' : preferences.selectedId }
}
