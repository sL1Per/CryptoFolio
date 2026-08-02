import type { CoinPrice, TimeRange, Currency, HistoryPoint } from '../types'
import { TIME_RANGE_DAYS } from './constants'

export class RateLimitedError extends Error {
  constructor() {
    super('rate_limited')
    this.name = 'RateLimitedError'
  }
}

async function getJson<T>(path: string, ids: string[]): Promise<T> {
  const param = [...new Set(ids)].sort().join(',')
  const res = await fetch(`${path}?ids=${param}`)
  if (res.status === 429) throw new RateLimitedError()
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`)
  return (await res.json()) as T
}

export function fetchPrices(ids: string[]): Promise<Record<string, CoinPrice>> {
  return getJson<Record<string, CoinPrice>>('/api/prices', ids)
}

export function fetchImages(ids: string[]): Promise<Record<string, string>> {
  return getJson<Record<string, string>>('/api/images', ids)
}

export type HistoryResult =
  | { ok: true; points: HistoryPoint[] }
  | { ok: false; rateLimited: boolean }

export async function fetchCoinHistory(
  id: string,
  range: TimeRange,
  currency: Currency,
): Promise<HistoryResult> {
  try {
    const res = await fetch(`/api/history/${id}?days=${TIME_RANGE_DAYS[range]}&vs=${currency}`)
    if (res.status === 429) return { ok: false, rateLimited: true }
    if (!res.ok) return { ok: false, rateLimited: false }
    const json = (await res.json()) as { prices?: [number, number][] }
    const points = (json.prices ?? []).map(([ts, price]) => ({ ts, price }))
    return { ok: true, points }
  } catch {
    return { ok: false, rateLimited: false }
  }
}
