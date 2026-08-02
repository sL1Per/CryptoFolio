import { describe, it, expect, beforeEach } from 'vitest'
import {
  CHART_TTL_MS, chartCacheKey, isCacheValid, loadChartCache, saveChartCache, type ChartCacheEntry,
} from './cache'

const entry = (over: Partial<ChartCacheEntry> = {}): ChartCacheEntry => ({
  coinId: 'bitcoin', currency: 'usd', range: '7D', fetchedAt: 1_000_000, points: [{ ts: 1, price: 2 }], ...over,
})

describe('chartCacheKey', () => {
  it('joins coin, currency and range with pipes', () => {
    expect(chartCacheKey('bitcoin', 'eur', '1M')).toBe('bitcoin|eur|1M')
  })
})

describe('isCacheValid', () => {
  it('is valid within the per-range TTL and invalid past it', () => {
    const e = entry({ range: '7D', fetchedAt: 1_000_000 })
    expect(isCacheValid(e, 1_000_000 + CHART_TTL_MS['7D'] - 1)).toBe(true)
    expect(isCacheValid(e, 1_000_000 + CHART_TTL_MS['7D'] + 1)).toBe(false)
  })
  it('uses the entry range TTL (5Y is longest)', () => {
    const e = entry({ range: '5Y', fetchedAt: 0 })
    expect(isCacheValid(e, CHART_TTL_MS['5Y'] - 1)).toBe(true)
  })
})

describe('load/save round-trip', () => {
  beforeEach(() => localStorage.clear())
  it('persists and restores entries by key', () => {
    const cache = { 'bitcoin|usd|7D': entry() }
    saveChartCache(cache)
    expect(loadChartCache()).toEqual(cache)
  })
  it('returns an empty cache when nothing stored or JSON is corrupt', () => {
    expect(loadChartCache()).toEqual({})
    localStorage.setItem('cryptofolio_chartcache_v1', 'not json')
    expect(loadChartCache()).toEqual({})
  })
})
