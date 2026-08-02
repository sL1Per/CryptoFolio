import type { CoinPrice } from '../types'

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
