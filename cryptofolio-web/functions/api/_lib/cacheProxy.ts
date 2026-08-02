export interface CacheLike {
  match(req: Request): Promise<Response | undefined>
  put(req: Request, res: Response): Promise<void>
}

export interface ProxyConfig {
  cacheKeyUrl: string
  upstreamUrl: string
  freshTtlMs: number
  retentionSecs: number
  transform: (json: unknown) => unknown
}

export interface ProxyDeps {
  cache: CacheLike
  fetchUpstream: (url: string) => Promise<Response>
  now: () => number
  waitUntil?: (p: Promise<unknown>) => void
}

const CACHED_AT = 'x-cached-at'

export function jsonResponse(body: unknown, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function withCacheStatus(res: Response, status: 'fresh' | 'stale'): Response {
  const headers = new Headers(res.headers)
  headers.set('x-cache-status', status)
  headers.set('Cache-Control', 'no-store')
  return new Response(res.body, { status: res.status, headers })
}

export function parseIds(raw: string | null): string[] | null {
  if (!raw) return null
  const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))].sort()
  if (ids.length === 0) return null
  return ids.slice(0, 250)
}

export async function cacheProxy(config: ProxyConfig, deps: ProxyDeps): Promise<Response> {
  const key = new Request(config.cacheKeyUrl)
  const cached = await deps.cache.match(key)

  if (cached) {
    const at = Number(cached.headers.get(CACHED_AT) ?? 0)
    if (deps.now() - at < config.freshTtlMs) return withCacheStatus(cached, 'fresh')
  }

  try {
    const upstream = await deps.fetchUpstream(config.upstreamUrl)
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`)
    const body = config.transform(await upstream.json())
    const edgeResp = jsonResponse(body, {
      'Cache-Control': `public, max-age=${config.retentionSecs}`,
      [CACHED_AT]: String(deps.now()),
      'x-cache-status': 'miss',
    })
    const put = deps.cache.put(key, edgeResp)
    if (deps.waitUntil) deps.waitUntil(put)
    else await put
    return jsonResponse(body, { 'Cache-Control': 'no-store', 'x-cache-status': 'miss' })
  } catch {
    if (cached) return withCacheStatus(cached, 'stale')
    return jsonResponse({ error: 'rate_limited' }, { 'Cache-Control': 'no-store', 'x-cache-status': 'error' }, 429)
  }
}
