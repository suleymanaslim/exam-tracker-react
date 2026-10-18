import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { fetchMonthlyPlanAccess, monthlyAccessEvent, monthlyAccessStorage, monthlyPlanAccessError } from './monthlyPlanAccess'
import type { MonthlyPlanAccess } from './monthlyPlanAccess'

export function useMonthlyPlanAccess() {
  const [plans, setPlans] = useState<MonthlyPlanAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const refreshRef = useRef<() => void>(() => {})
  const refresh = useCallback(() => refreshRef.current(), [])
  useEffect(() => {
    let active = true, version = 0
    let account: string | null | undefined
    const load = async () => {
      const request = ++version
      try {
        const data = await fetchMonthlyPlanAccess(supabase)
        if (!active || request !== version) return
        setPlans(data); setError(''); setLoading(false); setRevision(previous => previous + 1)
      } catch (error) {
        if (active && request === version) { setPlans([]); setError(monthlyPlanAccessError(error)); setLoading(false) }
      }
    }
    refreshRef.current = () => { void load() }
    const onStorage = (event: StorageEvent) => { if (event.key === monthlyAccessStorage) void load() }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        const nextAccount = session?.user.id || null
        if (account === nextAccount) return
        account = nextAccount
        version++; setPlans([]); setLoading(true)
        // Do not call Supabase inside its synchronous auth callback.
        queueMicrotask(() => { if (active) void load() })
      }
    })
    void load()
    window.addEventListener('focus', refresh); window.addEventListener(monthlyAccessEvent, refresh); window.addEventListener('storage', onStorage)
    return () => { active = false; version++; subscription.unsubscribe(); window.removeEventListener('focus', refresh); window.removeEventListener(monthlyAccessEvent, refresh); window.removeEventListener('storage', onStorage) }
  }, [refresh])
  return { plans, loading, error, revision, refresh }
}
