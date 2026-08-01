import { cacheProxy, parseIds, jsonResponse } from './_lib/cacheProxy'

export const onRequestGet: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  const ids = parseIds(url.searchParams.get('ids'))
  if (!ids) return jsonResponse({ error: 'missing ids' }, {}, 400)
  const param = ids.join(',')
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
      fetchUpstream: (u) =>
        fetch(u, { headers: { 'User-Agent': 'CryptoFolio/1.0 (+https://cryptofolio.app)', Accept: 'application/json' } }),
      now: () => Date.now(),
      waitUntil: (p) => context.waitUntil(p),
    },
  )
}
