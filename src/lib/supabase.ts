import { createClient } from '@supabase/supabase-js'
import { createRequestCache } from './requestCache'

const requests = createRequestCache((input, init) => fetch(input, init))
export const invalidateDataCache = requests.clear

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { global: { fetch: requests.fetch } }
)

let account: string | null = null
supabase.auth.onAuthStateChange((event, session) => {
  if (account !== (session?.user.id ?? null) || event === 'SIGNED_OUT' || event === 'USER_UPDATED') requests.clear()
  account = session?.user.id ?? null
})
window.addEventListener('storage', event => {
  if (event.key === null || event.key.startsWith('sb-') || event.key === 'examtracker-monthly-access-updated' || event.key === 'examtracker-community-updated') requests.clear()
})
window.addEventListener('online', requests.clear)
for (const event of ['study-session-saved', 'question-data-changed', 'ags-topic-source-changed', 'monthly-plan-access-changed', 'community-visibility-updated']) {
  window.addEventListener(event, requests.clear)
}

// UI identity comes from the existing session; permissions are checked by JWT/RLS
// on every server request. Never use this helper to authorize privileged actions.
export async function getCurrentUser() {
  const { data: { session }, error } = await supabase.auth.getSession()
  return { data: { user: session?.user ?? null }, error }
}
