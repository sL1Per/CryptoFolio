import { describe, it, expect, vi } from 'vitest'
import { cacheProxy, parseIds, type CacheLike } from './cacheProxy'

function fakeCache(initial?: Response): { cache: CacheLike; store: { v?: Response } } {
  const store: { v?: Response } = { v: initial }
  return {
    store,
    cache: {
      match: async () => (store.v ? store.v.clone() : undefined),
      put: async (_req, res) => { store.v = res.clone() },
    },
  }
}

const CFG = {
  cacheKeyUrl: 'https://cache/prices?ids=bitcoin',
  upstreamUrl: 'https://api.coingecko.com/x',
  freshTtlMs: 60_000,
  retentionSecs: 3600,
  transform: (j: unknown) => j,
}

describe('parseIds', () => {
  it('returns null for missing/empty', () => {
    expect(parseIds(null)).toBeNull()
    expect(parseIds('')).toBeNull()
    expect(parseIds('  ')).toBeNull()
  })
  it('splits, trims, de-dupes and sorts', () => {
    expect(parseIds('ethereum,bitcoin,ethereum')).toEqual(['bitcoin', 'ethereum'])
  })
  it('caps to 250 ids', () => {
    const many = Array.from({ length: 300 }, (_, i) => `c${i}`).join(',')
    expect(parseIds(many)!.length).toBe(250)
  })
})

describe('cacheProxy', () => {
  it('cold miss: fetches upstream, transforms, stores, returns body', async () => {
    const { cache, store } = fakeCache()
    const fetchUpstream = vi.fn(async () => new Response(JSON.stringify({ bitcoin: { usd: 1 } }), { status: 200 }))
    const res = await cacheProxy({ ...CFG, transform: (j) => j }, { cache, fetchUpstream, now: () => 1000 })
    expect(fetchUpstream).toHaveBeenCalledOnce()
    expect(await res.json()).toEqual({ bitcoin: { usd: 1 } })
    expect(store.v).toBeDefined() // cached
    expect(res.headers.get('x-cache-status')).toBe('miss')
    // Browser must never cache this response — only the edge copy gets the long max-age.
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(store.v!.headers.get('Cache-Control')).toContain('max-age=')
    expect(store.v!.headers.get('x-cached-at')).toBeTruthy()
  })

  it('fresh hit: does not call upstream', async () => {
    const cached = new Response(JSON.stringify({ ok: 1 }), { headers: { 'x-cached-at': '1000', 'content-type': 'application/json' } })
    const { cache } = fakeCache(cached)
    const fetchUpstream = vi.fn()
    const res = await cacheProxy(CFG, { cache, fetchUpstream, now: () => 1000 + 59_000 })
    expect(fetchUpstream).not.toHaveBeenCalled()
    expect(res.headers.get('x-cache-status')).toBe('fresh')
    expect(await res.json()).toEqual({ ok: 1 })
    // Even a fresh cache hit must not be cached by the browser's own HTTP cache.
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('stale hit: refetches and updates', async () => {
    const cached = new Response(JSON.stringify({ old: 1 }), { headers: { 'x-cached-at': '1000', 'content-type': 'application/json' } })
    const { cache } = fakeCache(cached)
    const fetchUpstream = vi.fn(async () => new Response(JSON.stringify({ new: 1 }), { status: 200 }))
    const res = await cacheProxy(CFG, { cache, fetchUpstream, now: () => 1000 + 61_000 })
    expect(fetchUpstream).toHaveBeenCalledOnce()
    expect(await res.json()).toEqual({ new: 1 })
  })

  it('stale hit + upstream 429: serves stale cached body', async () => {
    const cached = new Response(JSON.stringify({ old: 1 }), { headers: { 'x-cached-at': '1000', 'content-type': 'application/json' } })
    const { cache } = fakeCache(cached)
    const fetchUpstream = vi.fn(async () => new Response('', { status: 429 }))
    const res = await cacheProxy(CFG, { cache, fetchUpstream, now: () => 1000 + 61_000 })
    expect(res.headers.get('x-cache-status')).toBe('stale')
    expect(await res.json()).toEqual({ old: 1 })
  })

  it('cold + upstream 429: returns 429 error json', async () => {
    const { cache } = fakeCache()
    const fetchUpstream = vi.fn(async () => new Response('', { status: 429 }))
    const res = await cacheProxy(CFG, { cache, fetchUpstream, now: () => 1000 })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'rate_limited' })
  })

  it('applies transform (array → map)', async () => {
    const { cache } = fakeCache()
    const fetchUpstream = vi.fn(async () => new Response(JSON.stringify([{ id: 'bitcoin', image: 'u' }]), { status: 200 }))
    const res = await cacheProxy(
      { ...CFG, transform: (j) => Object.fromEntries((j as { id: string; image: string }[]).map((m) => [m.id, m.image])) },
      { cache, fetchUpstream, now: () => 1000 },
    )
    expect(await res.json()).toEqual({ bitcoin: 'u' })
  })
})
