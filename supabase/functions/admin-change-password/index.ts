import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { createPasswordHandler } from './handler.ts'

Deno.serve(async request => {
  const url = Deno.env.get('SUPABASE_URL')
  let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!key) {
    try { key = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default } catch { /* Missing configuration fails closed. */ }
  }
  if (!url || !key) return Response.json({ error: 'Sunucu yapılandırması eksik.' }, { status: 503, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } })
  // Privileged client exists only in the Supabase function, never in Vite/browser code.
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return createPasswordHandler({
    async getVerifiedUser(token) {
      const { data, error } = await admin.auth.getUser(token)
      return error ? null : data.user
    },
    async getRole(id) {
      const { data, error } = await admin.from('profiles').select('role').eq('id', id).maybeSingle()
      if (error) throw error
      return data?.role ?? null
    },
    async updatePassword(id, password) {
      const { error } = await admin.auth.admin.updateUserById(id, { password })
      return error ? { code: error.code } : null
    },
  })(request)
})
