import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchCoinHistory } from './coingecko'

afterEach(() => vi.restoreAllMocks())

function mockFetch(res: Partial<Response> & { status: number; json?: () => Promise<unknown> }) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    json: res.json ?? (async () => ({})),
  }) as unknown as Response))
}

describe('fetchCoinHistory', () => {
  it('requests the right url and maps prices to points', async () => {
    const spy = vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ prices: [[1000, 1.5], [2000, 2.5]] }),
    }) as unknown as Response)
    vi.stubGlobal('fetch', spy)
    const result = await fetchCoinHistory('bitcoin', '1Y', 'eur')
    expect(spy).toHaveBeenCalledWith('/api/history/bitcoin?days=365&vs=eur', { headers: undefined })
    expect(result).toEqual({ ok: true, points: [{ ts: 1000, price: 1.5 }, { ts: 2000, price: 2.5 }] })
  })

  it('returns rateLimited on 429', async () => {
    mockFetch({ status: 429 })
    expect(await fetchCoinHistory('bitcoin', '7D', 'usd')).toEqual({ ok: false, rateLimited: true })
  })

  it('returns non-rateLimited failure on other errors', async () => {
    mockFetch({ status: 502 })
    expect(await fetchCoinHistory('bitcoin', '7D', 'usd')).toEqual({ ok: false, rateLimited: false })
  })

  it('returns non-rateLimited failure when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    expect(await fetchCoinHistory('bitcoin', '7D', 'usd')).toEqual({ ok: false, rateLimited: false })
  })
})
