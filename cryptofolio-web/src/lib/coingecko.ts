import type { CoinPrice, TimeRange, Currency, HistoryPoint } from '../types'
import { TIME_RANGE_DAYS } from './constants'

export class RateLimitedError extends Error {
  constructor() {
    super('rate_limited')
    this.name = 'RateLimitedError'
  }
}

/** Headers to send to our proxy — forwards the user's own CoinGecko key when set. */
function apiKeyHeaders(apiKey?: string): HeadersInit | undefined {
  return apiKey ? { 'x-cg-demo-api-key': apiKey } : undefined
}

async function getJson<T>(path: string, ids: string[], apiKey?: string): Promise<T> {
  const param = [...new Set(ids)].sort().join(',')
  const res = await fetch(`${path}?ids=${param}`, { headers: apiKeyHeaders(apiKey) })
  if (res.status === 429) throw new RateLimitedError()
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`)
  return (await res.json()) as T
}

export function fetchPrices(ids: string[], apiKey?: string): Promise<Record<string, CoinPrice>> {
  return getJson<Record<string, CoinPrice>>('/api/prices', ids, apiKey)
}

export function fetchImages(ids: string[], apiKey?: string): Promise<Record<string, string>> {
  return getJson<Record<string, string>>('/api/images', ids, apiKey)
}

export type HistoryResult =
  | { ok: true; points: HistoryPoint[] }
  | { ok: false; rateLimited: boolean }

export async function fetchCoinHistory(
  id: string,
  range: TimeRange,
  currency: Currency,
  apiKey?: string,
): Promise<HistoryResult> {
  try {
    const res = await fetch(`/api/history/${id}?days=${TIME_RANGE_DAYS[range]}&vs=${currency}`, {
      headers: apiKeyHeaders(apiKey),
    })
    if (res.status === 429) return { ok: false, rateLimited: true }
    if (!res.ok) return { ok: false, rateLimited: false }
    const json = (await res.json()) as { prices?: [number, number][] }
    const points = (json.prices ?? []).map(([ts, price]) => ({ ts, price }))
    return { ok: true, points }
  } catch {
    return { ok: false, rateLimited: false }
  }
}
