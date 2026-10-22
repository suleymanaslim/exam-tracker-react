// Cache only authenticated data reads in this tab. Never persist responses or tokens.
// Writes invalidate before and after the request, including uncertain network failures.
interface Entry { body: string; status: number; statusText: string; headers: Headers; expiresAt: number }
interface Options { ttlMs?: number; maxEntries?: number; maxBytes?: number; now?: () => number }
export function createRequestCache(network: typeof fetch, options: Options = {}) {
  const entries = new Map<string, Entry>()
  const pending = new Map<string, Promise<Response>>()
  const now = options.now ?? Date.now
  const ttl = options.ttlMs ?? 30_000
  const maxEntries = options.maxEntries ?? 80
  const maxBytes = options.maxBytes ?? 4_000_000
  let bytes = 0, generation = 0
  const remove = (key: string) => { const entry = entries.get(key); if (entry) bytes -= entry.body.length * 2; entries.delete(key) }
  const clear = () => { generation++; entries.clear(); pending.clear(); bytes = 0 }
  const fetchCached: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : null
    const url = new URL(request?.url ?? String(input))
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const isData = url.pathname.startsWith('/rest/v1/')
    // These RPCs check current permissions; coalesce simultaneous calls without retaining them.
    const readRpc = method === 'POST' && /^\/rest\/v1\/rpc\/(get_accessible_monthly_plans|get_shared_monthly_plan|get_dashboard_community)$/.test(url.pathname)
    const read = isData && ((method === 'GET' && !url.pathname.includes('/rpc/')) || readRpc)
    if (!read) {
      if (isData && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        clear()
        try { return await network(input, init) } finally { clear() }
      }
      return network(input, init)
    }
    // A caller-owned AbortSignal must not cancel another component's shared request.
    if (init?.signal || request || init?.cache === 'no-store') return network(input, init)
    const headers = new Headers(init?.headers)
    const key = JSON.stringify([url.href, method, [...headers.entries()].sort(), readRpc ? init?.body : null])
    const cached = entries.get(key)
    if (cached && cached.expiresAt > now()) {
      entries.delete(key); entries.set(key, cached)
      return new Response(cached.body, cached)
    }
    remove(key)
    const shared = pending.get(key)
    if (shared) return (await shared).clone()
    const version = generation
    const operation = (async () => {
      const response = await network(input, init)
      if (response.ok && !readRpc && !response.headers.get('cache-control')?.includes('no-store') && version === generation) {
        const body = await response.clone().text()
        const size = body.length * 2
        if (version === generation && size <= maxBytes && response.status !== 204) {
          remove(key)
          entries.set(key, { body, headers: new Headers(response.headers), status: response.status, statusText: response.statusText, expiresAt: now() + ttl })
          bytes += size
          while (entries.size > maxEntries || bytes > maxBytes) remove(entries.keys().next().value!)
        }
      }
      return response
    })()
    pending.set(key, operation)
    try { return (await operation).clone() }
    finally { if (pending.get(key) === operation) pending.delete(key) }
  }
  return { fetch: fetchCached, clear }
}
