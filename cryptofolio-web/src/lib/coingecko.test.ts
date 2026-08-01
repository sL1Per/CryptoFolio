import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchPrices, fetchImages, RateLimitedError } from './coingecko'

afterEach(() => vi.restoreAllMocks())

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })))
}

describe('coingecko client', () => {
  it('fetchPrices returns parsed map and requests sorted ids', async () => {
    const f = vi.fn(async (_url: string) => new Response(JSON.stringify({ bitcoin: { usd: 1, eur: 1, usd_24h_change: 0, eur_24h_change: 0 } }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    const res = await fetchPrices(['ethereum', 'bitcoin'])
    expect(res.bitcoin.usd).toBe(1)
    expect(String(f.mock.calls[0][0])).toBe('/api/prices?ids=bitcoin,ethereum')
  })

  it('fetchPrices throws RateLimitedError on 429', async () => {
    mockFetch(429, { error: 'rate_limited' })
    await expect(fetchPrices(['bitcoin'])).rejects.toBeInstanceOf(RateLimitedError)
  })

  it('fetchPrices throws on other non-2xx', async () => {
    mockFetch(500, {})
    await expect(fetchPrices(['bitcoin'])).rejects.toThrow()
  })

  it('fetchImages returns the map', async () => {
    mockFetch(200, { bitcoin: 'http://img/btc.png' })
    expect(await fetchImages(['bitcoin'])).toEqual({ bitcoin: 'http://img/btc.png' })
  })
})
