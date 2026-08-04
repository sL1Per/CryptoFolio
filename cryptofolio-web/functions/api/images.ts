import { cacheProxy, parseIds, jsonResponse, coingeckoHeaders, resolveApiKey } from './_lib/cacheProxy'

interface Market { id: string; image: string }

export function imagesTransform(j: unknown): Record<string, string> {
  return Object.fromEntries(
    (Array.isArray(j) ? (j as Market[]) : [])
      .filter((m) => m && typeof m.id === 'string' && typeof m.image === 'string')
      .map((m) => [m.id, m.image]),
  )
}

export const onRequestGet: PagesFunction<{ CG_API_KEY?: string }> = async (context) => {
  const url = new URL(context.request.url)
  const ids = parseIds(url.searchParams.get('ids'))
  if (!ids) return jsonResponse({ error: 'missing ids' }, {}, 400)
  const param = ids.join(',')
  const apiKey = resolveApiKey(context.request.headers.get('x-cg-demo-api-key'), context.env.CG_API_KEY)
  return cacheProxy(
    {
      cacheKeyUrl: `https://cache.local/images?ids=${param}`,
      upstreamUrl: `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${param}&per_page=250&sparkline=false`,
      freshTtlMs: 86_400_000,
      retentionSecs: 604800,
      transform: imagesTransform,
    },
    {
      cache: caches.default,
      fetchUpstream: (u) => fetch(u, { headers: coingeckoHeaders(apiKey) }),
      now: () => Date.now(),
      waitUntil: (p) => context.waitUntil(p),
    },
  )
}
