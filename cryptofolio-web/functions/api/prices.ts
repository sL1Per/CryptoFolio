import { cacheProxy, parseIds, jsonResponse, coingeckoHeaders, resolveApiKey } from './_lib/cacheProxy'

export const onRequestGet: PagesFunction<{ CG_API_KEY?: string }> = async (context) => {
  const url = new URL(context.request.url)
  const ids = parseIds(url.searchParams.get('ids'))
  if (!ids) return jsonResponse({ error: 'missing ids' }, {}, 400)
  const param = ids.join(',')
  const apiKey = resolveApiKey(context.request.headers.get('x-cg-demo-api-key'), context.env.CG_API_KEY)
  return cacheProxy(
    {
      cacheKeyUrl: `https://cache.local/prices?ids=${param}`,
      upstreamUrl: `https://api.coingecko.com/api/v3/simple/price?ids=${param}&vs_currencies=usd,eur&include_24hr_change=true`,
      freshTtlMs: 60_000,
      retentionSecs: 3600,
      transform: (j) => j,
    },
    {
      cache: caches.default,
      fetchUpstream: (u) => fetch(u, { headers: coingeckoHeaders(apiKey) }),
      now: () => Date.now(),
      waitUntil: (p) => context.waitUntil(p),
    },
  )
}
