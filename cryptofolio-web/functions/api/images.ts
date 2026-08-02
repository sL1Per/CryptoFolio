import { cacheProxy, parseIds, jsonResponse } from './_lib/cacheProxy'

interface Market { id: string; image: string }

export const onRequestGet: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  const ids = parseIds(url.searchParams.get('ids'))
  if (!ids) return jsonResponse({ error: 'missing ids' }, {}, 400)
  const param = ids.join(',')
  return cacheProxy(
    {
      cacheKeyUrl: `https://cache.local/images?ids=${param}`,
      upstreamUrl: `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${param}&per_page=250&sparkline=false`,
      freshTtlMs: 86_400_000,
      retentionSecs: 604800,
      transform: (j) => Object.fromEntries((j as Market[]).map((m) => [m.id, m.image])),
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
