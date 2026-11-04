import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getCurrentUser, supabase } from './supabase'
import { useAdminStore } from './adminStore'
import { DEFAULT_POMODORO_PREFERENCES, readPomodoroPreferences, validatePomodoroPreferences, type PomodoroPreferences } from './pomodoroPresets'

// These are personal UI preferences, never an authorization source. Auth merges
// this one metadata key, preserving display names and unrelated account fields.
export function usePomodoroPreferences() {
  const impersonated = useAdminStore(state => state.impersonatedUserId)
  const [source, setSource] = useState<{ owner: string | null; preferences: PomodoroPreferences; loading: boolean }>({ owner: null, preferences: DEFAULT_POMODORO_PREFERENCES, loading: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const version = useRef(0)
  const busy = useRef(false), owner = useRef<string | null>(null), mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    const lifecycle = { active: true }
    version.current++
    const apply = (user: User | null) => {
      owner.current = user?.id || null
      setSource({ owner: owner.current, preferences: readPomodoroPreferences(user?.user_metadata?.pomodoro_preferences), loading: false })
      setError('')
    }
    const initialVersion = version.current
    void getCurrentUser().then(({ data: { user }, error }) => {
      if (!lifecycle.active || version.current !== initialVersion) return
      if (error) { setError('Sayaç tercihleri yüklenemedi. Sayfayı yenileyip tekrar dene.'); setSource(previous => ({ ...previous, loading: false })); return }
      apply(user)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { version.current++; if (lifecycle.active) apply(session?.user || null) })
    return () => { lifecycle.active = false; mounted.current = false; subscription.unsubscribe() }
  }, [])
  const save = async (next: PomodoroPreferences): Promise<boolean> => {
    if (busy.current || source.loading || !source.owner || impersonated) return false
    const target = source.owner
    busy.current = true; setSaving(true); setError('')
    try {
      const preferences = validatePomodoroPreferences(next)
      const { data: { user }, error: authError } = await getCurrentUser()
      if (authError || user?.id !== target || owner.current !== target || useAdminStore.getState().impersonatedUserId) throw new Error('Hesap değişti. Sayfayı yenileyip tekrar dene.')
      const { data, error } = await supabase.auth.updateUser({ data: { pomodoro_preferences: preferences } })
      if (error) throw new Error('Sayaç kaydedilemedi. Bağlantını kontrol edip tekrar dene.')
      if (!mounted.current || owner.current !== target || data.user?.id !== target || useAdminStore.getState().impersonatedUserId) return false
      const stored = readPomodoroPreferences(data.user.user_metadata?.pomodoro_preferences)
      if (JSON.stringify(stored) !== JSON.stringify(preferences)) throw new Error('Sayaç kaydı doğrulanamadı. Lütfen tekrar dene.')
      setSource({ owner: target, preferences: stored, loading: false })
      return true
    } catch (failure) {
      if (mounted.current && owner.current === target) setError(failure instanceof Error ? failure.message : 'Sayaç kaydedilemedi.')
      return false
    } finally { busy.current = false; if (mounted.current) setSaving(false) }
  }
  return { preferences: impersonated ? DEFAULT_POMODORO_PREFERENCES : source.preferences, loading: source.loading, saving, error,
    readOnly: !!impersonated || !source.owner, save }
}
