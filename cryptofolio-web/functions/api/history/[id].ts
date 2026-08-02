import { cacheProxy, jsonResponse } from '../_lib/cacheProxy'

export type HistoryParams = { id: string; days: number; vs: 'usd' | 'eur' }

const ALLOWED_DAYS = new Set([7, 30, 365, 1825])
const TTL_MS: Record<number, number> = { 7: 600_000, 30: 3_600_000, 365: 21_600_000, 1825: 86_400_000 }

export function validateHistoryRequest(
  id: string | undefined,
  days: string | null,
  vs: string | null,
): HistoryParams | null {
  if (!id || !/^[a-z0-9-]+$/.test(id)) return null
  const d = Number(days)
  if (!ALLOWED_DAYS.has(d)) return null
  if (vs !== 'usd' && vs !== 'eur') return null
  return { id, days: d, vs }
}

export function historyTransform(json: unknown): { prices: [number, number][] } {
  const raw = (json as { prices?: unknown })?.prices
  if (!Array.isArray(raw)) return { prices: [] }
  const prices = raw.filter(
    (p): p is [number, number] =>
      Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number',
  ).map((p) => [p[0], p[1]] as [number, number])
  return { prices }
}

export const onRequestGet: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  const id = context.params.id as string | undefined
  const params = validateHistoryRequest(id, url.searchParams.get('days'), url.searchParams.get('vs'))
  if (!params) return jsonResponse({ error: 'invalid request' }, {}, 400)

  return cacheProxy(
    {
      cacheKeyUrl: `https://cache.local/history?id=${params.id}&days=${params.days}&vs=${params.vs}`,
      upstreamUrl: `https://api.coingecko.com/api/v3/coins/${params.id}/market_chart?vs_currency=${params.vs}&days=${params.days}&precision=2`,
      freshTtlMs: TTL_MS[params.days],
      retentionSecs: Math.round(TTL_MS[params.days] / 1000) * 2,
      transform: historyTransform,
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
