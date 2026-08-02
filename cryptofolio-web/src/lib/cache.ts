import type { Currency, TimeRange, HistoryPoint } from '../types'

export interface ChartCacheEntry {
  coinId: string
  currency: Currency
  range: TimeRange
  fetchedAt: number // ms epoch
  points: HistoryPoint[]
}

export type ChartCache = Record<string, ChartCacheEntry>

export const CHART_TTL_MS: Record<TimeRange, number> = {
  '7D': 10 * 60 * 1000,
  '1M': 60 * 60 * 1000,
  '1Y': 6 * 60 * 60 * 1000,
  '5Y': 24 * 60 * 60 * 1000,
}

const STORAGE_KEY = 'cryptofolio_chartcache_v1'

export function chartCacheKey(coinId: string, currency: Currency, range: TimeRange): string {
  return `${coinId}|${currency}|${range}`
}

export function isCacheValid(entry: ChartCacheEntry, now: number): boolean {
  return now - entry.fetchedAt < CHART_TTL_MS[entry.range]
}

export function loadChartCache(): ChartCache {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const entries = JSON.parse(raw) as ChartCacheEntry[]
    if (!Array.isArray(entries)) return {}
    const cache: ChartCache = {}
    for (const e of entries) cache[chartCacheKey(e.coinId, e.currency, e.range)] = e
    return cache
  } catch {
    return {}
  }
}

export function saveChartCache(cache: ChartCache): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.values(cache)))
  } catch {
    /* quota / unavailable — ignore, mirrors native best-effort persistence */
  }
}
