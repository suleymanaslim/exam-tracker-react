import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { readAgsTopicSource, agsTopicSourceError } from './agsTopicSource'
import type { AgsTopicSource } from './agsTopicSource'

export function useAgsTopicSource(userId: string | null) {
  const [state, setState] = useState<{ owner: string | null; source: AgsTopicSource | null; loading: boolean; error: string }>({ owner: null, source: null, loading: true, error: '' })
  const [saving, setSaving] = useState(false)
  const [retry, setRetry] = useState(0)
  const mounted = useRef(false), scope = useRef<string | null>(null), version = useRef(0), submitting = useRef(false)
  useEffect(() => {
    mounted.current = true; scope.current = userId; version.current++
    let active = true
    const load = async () => {
      if (!userId) return
      const request = ++version.current
      try {
        const source = await readAgsTopicSource(supabase, userId)
        if (active && request === version.current) setState({ owner: userId, source, loading: false, error: '' })
      } catch (error) { if (active && request === version.current) setState({ owner: userId, source: null, loading: false, error: agsTopicSourceError(error) }) }
    }
    const refresh = (event: Event) => { if (!(event instanceof CustomEvent) || event.detail?.userId === userId) void load() }
    void load()
    window.addEventListener('ags-topic-source-changed', refresh); window.addEventListener('focus', refresh)
    return () => { active = false; mounted.current = false; scope.current = null; version.current++; window.removeEventListener('ags-topic-source-changed', refresh); window.removeEventListener('focus', refresh) }
  }, [userId, retry])
  const choose = useCallback(async (source: AgsTopicSource) => {
    if (!userId || submitting.current) return false
    const owner = userId
    submitting.current = true; setSaving(true)
    // An older pending read must not restore the previous source after this save.
    version.current++
    try {
      const { data, error } = await supabase.rpc('set_ags_topic_source', { p_user_id: owner, p_source: source })
      if (error) throw error
      if (data !== source) throw new Error('Tercih doğrulanamadı.')
      if (mounted.current && scope.current === owner) setState({ owner, source, loading: false, error: '' })
      window.dispatchEvent(new CustomEvent('ags-topic-source-changed', { detail: { userId: owner } }))
      return true
    } catch (error) { if (mounted.current && scope.current === owner) setState(previous => ({ ...previous, owner, error: agsTopicSourceError(error), loading: false })); return false }
    finally { submitting.current = false; if (mounted.current && scope.current === owner) setSaving(false) }
  }, [userId])
  const visible = state.owner === userId ? state : { source: null, loading: true, error: '' }
  return { ...visible, saving, choose, refresh: () => setRetry(value => value + 1) }
}
