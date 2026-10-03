export interface PasswordAdminBackend {
  getVerifiedUser(token: string): Promise<{ id: string } | null>
  getRole(id: string): Promise<string | null>
  updatePassword(id: string, password: string): Promise<{ code?: string } | null>
}
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}
export function createPasswordHandler(backend: PasswordAdminBackend) {
  const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return json(405, { error: 'Yalnızca POST kullanılabilir.' })
    const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)
    if (!bearer) return json(401, { error: 'Giriş yapmanız gerekiyor.' })
    try {
      // Caller identity comes from Supabase Auth, never the body or browser admin state.
      const caller = await backend.getVerifiedUser(bearer[1])
      if (!caller) return json(401, { error: 'Oturum geçersiz. Yeniden giriş yapın.' })
      if (await backend.getRole(caller.id) !== 'admin') return json(403, { error: 'Bu işlem için admin yetkisi gerekiyor.' })
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json(415, { error: 'JSON gönderilmelidir.' })
      if (Number(request.headers.get('Content-Length') || 0) > 8192) return json(413, { error: 'İstek çok büyük.' })
      const text = await request.text()
      if (text.length > 8192) return json(413, { error: 'İstek çok büyük.' })
      let body: unknown
      try { body = JSON.parse(text) } catch { return json(400, { error: 'Geçersiz istek.' }) }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'Geçersiz istek.' })
      const { userId, password } = body as Record<string, unknown>
      if (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return json(400, { error: 'Geçerli bir kullanıcı seçin.' })
      if (typeof password !== 'string' || password.length < 8 || password.length > 128 || !password.trim()) return json(400, { error: 'Şifre 8–128 karakter olmalı.' })
      const targetRole = await backend.getRole(userId)
      if (targetRole === null) return json(404, { error: 'Kullanıcı bulunamadı.' })
      if (targetRole !== 'user' || userId === caller.id) return json(403, { error: 'Bu alandan yalnızca normal kullanıcıların şifresi değiştirilebilir.' })
      const error = await backend.updatePassword(userId, password)
      if (error) return json(error.code === 'user_not_found' ? 404 : 400, { error: error.code === 'user_not_found' ? 'Kullanıcı bulunamadı.' : 'Şifre değiştirilemedi. Supabase şifre koşullarını kontrol edin.' })
      return json(200, { success: true })
    } catch {
      // Never return request bodies, passwords, or privileged backend error details.
      return json(500, { error: 'İşlem tamamlanamadı. Lütfen tekrar deneyin.' })
    }
  }
}
