import { useEffect, useState } from 'react'
import { useAdminStore } from './adminStore'
import { supabase } from './supabase'
import { fetchQuestionData, questionPlanError } from './questionPlanData'
import type { QuestionPlan, QuestionLog } from './questionPlan'

export function useQuestionData() {
  const { impersonatedUserId } = useAdminStore()
  const [source, setSource] = useState<{ owner: string | null; plans: QuestionPlan[]; logs: QuestionLog[]; loading: boolean; error: string }>({ owner: impersonatedUserId, plans: [], logs: [], loading: true, error: '' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true, version = 0
    const load = async () => {
      const current = ++version
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) throw authError || new Error('Oturum bulunamadı.')
        const data = await fetchQuestionData(impersonatedUserId || user.id)
        if (active && current === version) setSource({ ...data, owner: impersonatedUserId, loading: false, error: '' })
      } catch (failure) { if (active && current === version) setSource({ owner: impersonatedUserId, plans: [], logs: [], loading: false, error: questionPlanError(failure as { code?: string }) }) }
    }
    const refresh = () => void load()
    refresh()
    window.addEventListener('study-session-saved', refresh)
    window.addEventListener('question-data-changed', refresh)
    return () => { active = false; window.removeEventListener('study-session-saved', refresh); window.removeEventListener('question-data-changed', refresh) }
  }, [impersonatedUserId, retry])
  // Hide the previous owner's rows immediately, before the new request finishes.
  const visible = source.owner === impersonatedUserId ? source : { plans: [], logs: [], loading: true, error: '' }
  return { ...visible, retry: () => setRetry(value => value + 1) }
}
