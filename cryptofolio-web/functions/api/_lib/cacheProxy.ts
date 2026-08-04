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

/**
 * Headers for every CoinGecko upstream request. When a Demo API key is present
 * the limit tracks the key rather than Cloudflare's shared egress IP, so the key
 * is what actually stops us sharing the free-tier quota with other CF tenants.
 */
export function coingeckoHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'CryptoFolio/1.0 (+https://cryptofolio.app)',
    Accept: 'application/json',
  }
  if (apiKey) headers['x-cg-demo-api-key'] = apiKey
  return headers
}

/**
 * Resolve which CoinGecko key to use: a per-request key the caller forwarded
 * (from the user's Settings) takes precedence, falling back to the deployment's
 * CG_API_KEY env secret, then to no key at all.
 */
export function resolveApiKey(fromHeader: string | null, fromEnv?: string): string | undefined {
  return fromHeader || fromEnv || undefined
}

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

  let upstreamWas429 = false
  try {
    const upstream = await deps.fetchUpstream(config.upstreamUrl)
    if (!upstream.ok) {
      upstreamWas429 = upstream.status === 429
      throw new Error(`upstream ${upstream.status}`)
    }
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
    if (upstreamWas429) {
      return jsonResponse({ error: 'rate_limited' }, { 'Cache-Control': 'no-store', 'x-cache-status': 'rate-limited' }, 429)
    }
    return jsonResponse({ error: 'upstream_error' }, { 'Cache-Control': 'no-store', 'x-cache-status': 'error' }, 502)
  }
}
