# CryptoFolio Web — Phase 2 (Live Data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire live CoinGecko prices (USD+EUR, 24h change) and coin images into the Phase 1 app, fetched through two Cloudflare Pages Functions that cache server-side (Cache API) to protect the free-tier rate limit.

**Architecture:** Two thin `onRequestGet` Functions delegate to a pure, dependency-injected caching core (`cacheProxy`) that serves fresh cache hits without an upstream call, refetches when stale, and serves a retained stale copy on upstream 429. A `lib/coingecko.ts` client calls `/api/*` same-origin; a store `fetchPrices` action fills `prices`/`coinImages` and keeps last-known values on error. Fetches are triggered from the React layer (mount + when the set of held coin ids changes + a manual refresh button).

**Tech Stack:** Cloudflare Pages Functions (Workers runtime, `caches.default`), `@cloudflare/workers-types`, Vite, React 18, TypeScript, Zustand, Vitest, Wrangler.

## Global Constraints

- All paths under `cryptofolio-web/`. TypeScript strict.
- No raw hex in components — mapped Tailwind tokens or `x-[var(--foo)]`.
- Functions run on the Workers runtime: `caches.default` and `fetch` are globals; no secrets/env (CoinGecko free tier, no key).
- Cache freshness: **prices** fresh TTL `60_000` ms, retention `3600` s; **images** fresh TTL `86_400_000` ms, retention `604800` s.
- Cache key derived from **sorted, de-duplicated** ids so `?ids=b,a` and `?ids=a,b` share an entry.
- Client resilience: `fetchPrices` **never clears `prices` on error** (keep last-known); images are best-effort and never surface an error.
- No history route, no charts, no polling. **No fetch on currency switch** (prices already carry both usd+eur). Fetch triggers: app mount, when the unique held-coin-id set changes (covers add), and the manual refresh button.
- Persistence unchanged: `partialize` still excludes `prices`/`coinImages`.
- Commit after every task with the shown message.

---

### Task 1: Pure caching core (`cacheProxy`) + id parsing

**Files:**
- Create: `functions/api/_lib/cacheProxy.ts`
- Create: `functions/api/_lib/cacheProxy.test.ts`

**Interfaces:**
- Produces: `cacheProxy(config, deps): Promise<Response>`, types `ProxyConfig`/`ProxyDeps`/`CacheLike`, `parseIds(raw: string | null): string[] | null`, and `jsonResponse(body, headers?, status?)`.
- Consumes: only standard `Request`/`Response`/`URL`/JSON (no Workers globals) — fully testable under Vitest.

- [ ] **Step 1: Write the failing tests**

`functions/api/_lib/cacheProxy.test.ts`:

```ts
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
  })

  it('fresh hit: does not call upstream', async () => {
    const cached = new Response(JSON.stringify({ ok: 1 }), { headers: { 'x-cached-at': '1000', 'content-type': 'application/json' } })
    const { cache } = fakeCache(cached)
    const fetchUpstream = vi.fn()
    const res = await cacheProxy(CFG, { cache, fetchUpstream, now: () => 1000 + 59_000 })
    expect(fetchUpstream).not.toHaveBeenCalled()
    expect(res.headers.get('x-cache-status')).toBe('fresh')
    expect(await res.json()).toEqual({ ok: 1 })
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
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test -- functions/api/_lib/cacheProxy`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the core**

`functions/api/_lib/cacheProxy.ts`:

```ts
export interface CacheLike {
  match(req: Request): Promise<Response | undefined>
  put(req: Request, res: Response): Promise<void>
}

export interface ProxyConfig {
  cacheKeyUrl: string
  upstreamUrl: string
  freshTtlMs: number
  retentionSecs: number
  transform: (json: unknown) => unknown
}

export interface ProxyDeps {
  cache: CacheLike
  fetchUpstream: (url: string) => Promise<Response>
  now: () => number
  waitUntil?: (p: Promise<unknown>) => void
}

const CACHED_AT = 'x-cached-at'

export function jsonResponse(body: unknown, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function withCacheStatus(res: Response, status: 'fresh' | 'stale'): Response {
  const headers = new Headers(res.headers)
  headers.set('x-cache-status', status)
  return new Response(res.body, { status: res.status, headers })
}

export function parseIds(raw: string | null): string[] | null {
  if (!raw) return null
  const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))].sort()
  if (ids.length === 0) return null
  return ids.slice(0, 250)
}

export async function cacheProxy(config: ProxyConfig, deps: ProxyDeps): Promise<Response> {
  const key = new Request(config.cacheKeyUrl)
  const cached = await deps.cache.match(key)

  if (cached) {
    const at = Number(cached.headers.get(CACHED_AT) ?? 0)
    if (deps.now() - at < config.freshTtlMs) return withCacheStatus(cached, 'fresh')
  }

  try {
    const upstream = await deps.fetchUpstream(config.upstreamUrl)
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`)
    const body = config.transform(await upstream.json())
    const resp = jsonResponse(body, {
      'Cache-Control': `public, max-age=${config.retentionSecs}`,
      [CACHED_AT]: String(deps.now()),
      'x-cache-status': 'miss',
    })
    const put = deps.cache.put(key, resp.clone())
    if (deps.waitUntil) deps.waitUntil(put)
    else await put
    return resp
  } catch {
    if (cached) return withCacheStatus(cached, 'stale')
    return jsonResponse({ error: 'rate_limited' }, { 'x-cache-status': 'error' }, 429)
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `npm test -- functions/api/_lib/cacheProxy`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add functions/api/_lib/cacheProxy.ts functions/api/_lib/cacheProxy.test.ts
git commit -m "feat(functions): pure cache-proxy core + id parsing"
```

---

### Task 2: Pages Function handlers + Functions type-check config

**Files:**
- Create: `functions/api/prices.ts`, `functions/api/images.ts`, `functions/tsconfig.json`
- Modify: `tsconfig.json` (remove `functions` from include), `package.json` (add dep + scripts)

**Interfaces:**
- Consumes: `cacheProxy`, `parseIds`, `jsonResponse` from `_lib/cacheProxy`.
- Produces: `/api/prices` and `/api/images` endpoints (validated via type-check + Task 6 smoke).

- [ ] **Step 1: Add `@cloudflare/workers-types` and scripts**

Edit `package.json`: add to `devDependencies`:

```json
    "@cloudflare/workers-types": "^4.20241106.0",
```

Replace the `scripts` block with:

```json
  "scripts": {
    "dev:vite": "vite",
    "dev": "wrangler pages dev -- npm run dev:vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck:functions": "tsc -p functions/tsconfig.json"
  },
```

Run: `npm install`
Expected: `@cloudflare/workers-types` installed.

- [ ] **Step 2: Create the Functions tsconfig**

`functions/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true
  },
  "include": ["api/**/*.ts"],
  "exclude": ["**/*.test.ts"]
}
```

- [ ] **Step 3: Remove `functions` from the app build's type-check scope**

Edit `tsconfig.json`: change the `include` array from `["src", "functions"]` to:

```json
  "include": ["src"],
```

Why: the app builds against the DOM lib; the Functions build against `@cloudflare/workers-types` (which provides `caches.default`). They must not be type-checked together (duplicate `fetch`/`Response` lib conflict). Functions are checked via `npm run typecheck:functions`.

- [ ] **Step 4: Implement the handlers**

`functions/api/prices.ts`:

```ts
import { cacheProxy, parseIds, jsonResponse } from './_lib/cacheProxy'

export const onRequestGet: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  const ids = parseIds(url.searchParams.get('ids'))
  if (!ids) return jsonResponse({ error: 'missing ids' }, {}, 400)
  const param = ids.join(',')
  return cacheProxy(
    {
      cacheKeyUrl: `https://cache.local/prices?ids=${param}`,
      upstreamUrl: `https://api.coingecko.com/api/v3/simple/price?ids=${param}&vs_currencies=usd,eur&include_24hr_change=true`,
      freshTtlMs: 60_000,
      retentionSecs: 3600,
      transform: (j) => j,
    },
    {
      cache: caches.default,
      fetchUpstream: (u) => fetch(u),
      now: () => Date.now(),
      waitUntil: (p) => context.waitUntil(p),
    },
  )
}
```

`functions/api/images.ts`:

```ts
import { cacheProxy, parseIds, jsonResponse } from './_lib/cacheProxy'

interface Market { id: string; image: string }

export const onRequestGet: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  const ids = parseIds(url.searchParams.get('ids'))
  if (!ids) return jsonResponse({ error: 'missing ids' }, {}, 400)
  const param = ids.join(',')
  return cacheProxy(
    {
      cacheKeyUrl: `https://cache.local/images?ids=${param}`,
      upstreamUrl: `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${param}&per_page=250&sparkline=false`,
      freshTtlMs: 86_400_000,
      retentionSecs: 604800,
      transform: (j) => Object.fromEntries((j as Market[]).map((m) => [m.id, m.image])),
    },
    {
      cache: caches.default,
      fetchUpstream: (u) => fetch(u),
      now: () => Date.now(),
      waitUntil: (p) => context.waitUntil(p),
    },
  )
}
```

- [ ] **Step 5: Type-check functions + app + full suite**

Run: `npm run typecheck:functions`
Expected: no errors (handlers type-check against workers-types; `caches.default` resolves).

Run: `npm run build`
Expected: app `tsc -b` + vite build succeed (functions excluded from app build).

Run: `npm test`
Expected: all pass (Task 1's 9 + prior suite), no regressions.

- [ ] **Step 6: Commit**

```bash
git add functions/api/prices.ts functions/api/images.ts functions/tsconfig.json tsconfig.json package.json package-lock.json
git commit -m "feat(functions): /api/prices + /api/images handlers + workers typecheck"
```

---

### Task 3: Client — `lib/coingecko.ts`

**Files:**
- Create: `src/lib/coingecko.ts`, `src/lib/coingecko.test.ts`

**Interfaces:**
- Consumes: `CoinPrice` from `../types`.
- Produces: `RateLimitedError`, `fetchPrices(ids: string[]): Promise<Record<string, CoinPrice>>`, `fetchImages(ids: string[]): Promise<Record<string, string>>`.

- [ ] **Step 1: Write the failing test**

`src/lib/coingecko.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchPrices, fetchImages, RateLimitedError } from './coingecko'

afterEach(() => vi.restoreAllMocks())

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })))
}

describe('coingecko client', () => {
  it('fetchPrices returns parsed map and requests sorted ids', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ bitcoin: { usd: 1, eur: 1, usd_24h_change: 0, eur_24h_change: 0 } }), { status: 200 }))
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
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npm test -- src/lib/coingecko`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/coingecko.ts`:

```ts
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
```

- [ ] **Step 4: Run test — verify pass**

Run: `npm test -- src/lib/coingecko`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/coingecko.ts src/lib/coingecko.test.ts
git commit -m "feat: CoinGecko client (same-origin /api wrappers, typed rate-limit error)"
```

---

### Task 4: Store — `fetchPrices` action

**Files:**
- Modify: `src/store/portfolioStore.ts`
- Modify: `src/store/portfolioStore.test.ts`

**Interfaces:**
- Consumes: `fetchPrices`/`fetchImages`/`RateLimitedError` from `../lib/coingecko`.
- Produces: store action `fetchPrices(): Promise<void>` on `usePortfolioStore`.
- Note: existing actions (`addHolding`/`updateHolding`/`removeHolding`/setters) are UNCHANGED — no side effects added. Fetches are triggered from the React layer (Task 5).

- [ ] **Step 1: Write the failing tests**

Append to `src/store/portfolioStore.test.ts`:

```ts
import { vi, afterEach } from 'vitest'
import * as api from '../lib/coingecko'
import { RateLimitedError } from '../lib/coingecko'

const btc2 = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }

afterEach(() => vi.restoreAllMocks())

describe('fetchPrices action', () => {
  it('populates prices + images and sets lastUpdated on success', async () => {
    usePortfolioStore.setState({ holdings: [{ id: 'x', coin: btc2, amount: 1, exchangeId: 'coinbase' }], prices: {}, coinImages: {}, lastUpdated: null, errorMessage: null })
    vi.spyOn(api, 'fetchPrices').mockResolvedValue({ bitcoin: { usd: 100, eur: 90, usd_24h_change: 1, eur_24h_change: 1 } })
    vi.spyOn(api, 'fetchImages').mockResolvedValue({ bitcoin: 'http://img/btc.png' })
    await usePortfolioStore.getState().fetchPrices()
    const s = usePortfolioStore.getState()
    expect(s.prices.bitcoin.usd).toBe(100)
    expect(s.coinImages.bitcoin).toBe('http://img/btc.png')
    expect(s.lastUpdated).toBeTypeOf('number')
    expect(s.isLoading).toBe(false)
    expect(s.errorMessage).toBeNull()
  })

  it('keeps existing prices and sets errorMessage on rate limit', async () => {
    usePortfolioStore.setState({
      holdings: [{ id: 'x', coin: btc2, amount: 1, exchangeId: 'coinbase' }],
      prices: { bitcoin: { usd: 42, eur: 40, usd_24h_change: 0, eur_24h_change: 0 } },
      coinImages: { bitcoin: 'old.png' },
      errorMessage: null,
    })
    vi.spyOn(api, 'fetchPrices').mockRejectedValue(new RateLimitedError())
    vi.spyOn(api, 'fetchImages').mockResolvedValue({})
    await usePortfolioStore.getState().fetchPrices()
    const s = usePortfolioStore.getState()
    expect(s.prices.bitcoin.usd).toBe(42) // retained
    expect(s.errorMessage).toMatch(/rate limited/i)
    expect(s.isLoading).toBe(false)
  })

  it('no-ops with empty holdings', async () => {
    usePortfolioStore.setState({ holdings: [] })
    const spy = vi.spyOn(api, 'fetchPrices').mockResolvedValue({})
    await usePortfolioStore.getState().fetchPrices()
    expect(spy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test -- src/store/portfolioStore`
Expected: FAIL — `fetchPrices` is not a function.

- [ ] **Step 3: Implement**

Edit `src/store/portfolioStore.ts`:

1. Add import at top:

```ts
import * as coingecko from '../lib/coingecko'
import { RateLimitedError } from '../lib/coingecko'
```

2. Add to the `PortfolioState` interface (after `setCurrency`):

```ts
  fetchPrices: () => Promise<void>
```

3. Change the store creator signature from `(set) => ({` to `(set, get) => ({` and add the action (place it after `setCurrency`):

```ts
      fetchPrices: async () => {
        const ids = [...new Set(get().holdings.map((h) => h.coin.id))]
        if (ids.length === 0) return
        set({ isLoading: true, errorMessage: null })
        try {
          const prices = await coingecko.fetchPrices(ids)
          set({ prices, lastUpdated: Date.now() })
        } catch (err) {
          set({
            errorMessage:
              err instanceof RateLimitedError
                ? 'Rate limited — showing last known prices'
                : 'Could not update prices — showing last known values',
          })
        } finally {
          set({ isLoading: false })
        }
        // Images: best-effort, only for coins missing one; never surfaces an error.
        const missing = ids.filter((id) => !get().coinImages[id])
        if (missing.length > 0) {
          try {
            const images = await coingecko.fetchImages(missing)
            set((s) => ({ coinImages: { ...s.coinImages, ...images } }))
          } catch {
            /* ignore image failures */
          }
        }
      },
```

- [ ] **Step 4: Run tests — verify pass**

Run: `npm test -- src/store/portfolioStore`
Expected: all pass (the 4 pre-existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/store/portfolioStore.ts src/store/portfolioStore.test.ts
git commit -m "feat(store): fetchPrices action (keep last-known on error, best-effort images)"
```

---

### Task 5: React wiring — mount/refresh triggers, refresh button, error banner, skeleton

**Files:**
- Create: `src/components/ui/ErrorBanner.tsx`
- Modify: `src/components/layout/AppShell.tsx`, `src/routes/PortfolioPage.tsx`, `src/components/portfolio/TokenCard.tsx`, `src/components/portfolio/HoldingCard.tsx`
- Modify: `src/routes/PortfolioPage.test.tsx`

**Interfaces:**
- Consumes: `usePortfolioStore` (`fetchPrices`, `isLoading`, `errorMessage`).
- Produces: `ErrorBanner()`; `AppShell` gains `onRefresh: () => void` + `isRefreshing: boolean` props; cards show a skeleton for value/change while loading with no price yet.

- [ ] **Step 1: Write the failing tests**

Append to `src/routes/PortfolioPage.test.tsx` (add `waitFor` to the testing-library import and `vi` to the vitest import):

```ts
import { vi } from 'vitest'
import { waitFor } from '@testing-library/react'
// Mock the client so the mount effect does no real network I/O.
vi.mock('../lib/coingecko', () => ({
  RateLimitedError: class RateLimitedError extends Error {},
  fetchPrices: vi.fn().mockResolvedValue({}),
  fetchImages: vi.fn().mockResolvedValue({}),
}))
import * as api from '../lib/coingecko'

describe('PortfolioPage live-data wiring', () => {
  it('fetches prices on mount when holdings exist', async () => {
    const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
    usePortfolioStore.setState({ holdings: [{ id: 'h', coin: btc, amount: 1, exchangeId: 'coinbase' }], groupMode: 'token', prices: {}, coinImages: {} })
    render(<PortfolioPage />)
    await waitFor(() => expect(api.fetchPrices).toHaveBeenCalled())
  })

  it('refresh button triggers a fetch', async () => {
    const btc = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }
    usePortfolioStore.setState({ holdings: [{ id: 'h', coin: btc, amount: 1, exchangeId: 'coinbase' }], groupMode: 'token', prices: {}, coinImages: {} })
    render(<PortfolioPage />)
    await waitFor(() => expect(api.fetchPrices).toHaveBeenCalled())
    ;(api.fetchPrices as unknown as { mockClear: () => void }).mockClear()
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }))
    await waitFor(() => expect(api.fetchPrices).toHaveBeenCalled())
  })
})
```

Note: the mock at module scope applies to the whole test file — the two pre-existing PortfolioPage tests still pass (their assertions don't depend on prices; the mount fetch resolves to `{}`).

- [ ] **Step 2: Run test — verify it fails**

Run: `npm test -- src/routes/PortfolioPage`
Expected: FAIL — no button named /refresh/; `fetchPrices` not called on mount.

- [ ] **Step 3: Implement `ErrorBanner`**

`src/components/ui/ErrorBanner.tsx`:

```tsx
import { X } from 'lucide-react'

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--gold-border)] bg-[var(--gold-card-bg)] px-3 py-2 text-xs text-text-secondary">
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} aria-label="Dismiss" className="text-text-tertiary hover:text-text-primary">
        <X size={14} />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Update `AppShell` — add refresh button**

Edit `src/components/layout/AppShell.tsx`:
- Change the import to `import { Plus, Settings, RefreshCw } from 'lucide-react'`.
- Add props `onRefresh: () => void` and `isRefreshing: boolean` to the signature/type.
- Insert the refresh button as the first child of the right-hand `div` (before Add):

```tsx
            <button onClick={onRefresh} aria-label="Refresh prices" disabled={isRefreshing} className="rounded-lg border border-border p-2 text-text-secondary hover:text-text-primary disabled:opacity-50">
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
```

- [ ] **Step 5: Wire `PortfolioPage`**

Edit `src/routes/PortfolioPage.tsx`:
- Add imports: `import { useEffect } from 'react'` (merge with existing `useState` import) and `import { ErrorBanner } from '../components/ui/ErrorBanner'`.
- Read from store: `const fetchPrices = usePortfolioStore((s) => s.fetchPrices)`, `const isLoading = usePortfolioStore((s) => s.isLoading)`, `const errorMessage = usePortfolioStore((s) => s.errorMessage)`.
- Compute a stable signature of unique coin ids and fetch on mount + when it changes:

```tsx
  const coinKey = [...new Set(holdings.map((h) => h.coin.id))].sort().join(',')
  useEffect(() => {
    if (coinKey) fetchPrices()
  }, [coinKey, fetchPrices])
```

- Change the `AppShell` open tag to pass the new props:

```tsx
    <AppShell onAdd={() => setAddOpen(true)} onSettings={() => setSettingsOpen(true)} onRefresh={() => fetchPrices()} isRefreshing={isLoading}>
```

- Render the banner as the first child inside the `flex flex-col gap-5` div (before `<TotalPortfolioCard />`):

```tsx
        {errorMessage && <ErrorBanner message={errorMessage} onDismiss={() => usePortfolioStore.setState({ errorMessage: null })} />}
```

- [ ] **Step 6: Add the skeleton to the cards**

Edit `src/components/portfolio/TokenCard.tsx` and `src/components/portfolio/HoldingCard.tsx`. In each:
- Add `import { usePortfolioStore } from '../../store/portfolioStore'`.
- Inside the component, read loading and the raw (possibly undefined) price:

```tsx
  const isLoading = usePortfolioStore((s) => s.isLoading)
  const rawPrice = priceFor(snap, /* coinId: agg.coin.id in TokenCard, holding.coin.id in HoldingCard */)
  const showSkeleton = isLoading && rawPrice === undefined
```

- Replace the existing `const price = priceFor(...) ?? 0` line with the `rawPrice` above and compute `const value = (rawPrice ?? 0) * amount` (amount = `agg.totalAmount` / `holding.amount`).
- Where the value currency string is rendered, show the skeleton when `showSkeleton`:

```tsx
        {showSkeleton ? (
          <span className="inline-block h-4 w-16 animate-pulse rounded bg-card-bg-hover" />
        ) : (
          <span className="text-sm font-semibold text-text-primary">{formatCurrency(value, snap.currency)}</span>
        )}
```

(Keep everything else identical. The `ChangeBadge` already renders `—` when change is undefined, which reads fine during load — no skeleton needed there.)

- [ ] **Step 7: Run tests + build**

Run: `npm test -- src/routes/PortfolioPage`
Expected: 4 passed (2 pre-existing + 2 new).

Run: `npm test`
Expected: whole suite green.

Run: `npm run build`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/ErrorBanner.tsx src/components/layout/AppShell.tsx src/routes/PortfolioPage.tsx src/routes/PortfolioPage.test.tsx src/components/portfolio/TokenCard.tsx src/components/portfolio/HoldingCard.tsx
git commit -m "feat: live-data wiring — mount/refresh fetch, refresh button, error banner, loading skeleton"
```

---

### Task 6: Verification — full suite, functions typecheck, local Pages serving, browser smoke, docs

**Files:**
- Modify: `cryptofolio-web/README.md`

- [ ] **Step 1: Full suite + both type-checks + build**

Run: `npm test`
Expected: all suites pass (cacheProxy, coingecko, portfolioStore incl. fetchPrices, PortfolioPage wiring, all Phase 1 suites), output pristine.

Run: `npm run typecheck:functions`
Expected: no errors.

Run: `npm run build`
Expected: `tsc -b` + vite build clean.

- [ ] **Step 2: Local Cloudflare Pages serving with live Functions**

Run (background): `npm run build && npx wrangler pages dev dist --port 8788` (serves `dist/` + `functions/`).
Then verify the live proxy end-to-end (real CoinGecko):

```bash
curl -sS "http://localhost:8788/api/prices?ids=bitcoin,ethereum" -w "\n%{http_code}\n"
curl -sS "http://localhost:8788/api/images?ids=bitcoin" -w "\n%{http_code}\n"
curl -sS "http://localhost:8788/api/prices" -w "\n%{http_code}\n"   # expect 400 (missing ids)
```
Expected: prices returns a JSON map with `usd`/`eur` for both ids (HTTP 200); images returns `{"bitcoin":"https://…"}`; missing-ids returns 400. If CoinGecko rate-limits during the check, a repeat call should return the cached copy. Kill the wrangler process after.
(If wrangler cannot reach the network in this environment, record the exact failure and rely on the browser smoke against `npm run dev`.)

- [ ] **Step 3: Real browser smoke (Playwright), driven by the controller**

Serve `npm run dev` (wrangler + vite) or the built `wrangler pages dev dist`. In a browser:
- Add Bitcoin / 0.5 / Coinbase → within a moment the card shows a **real USD price**, a colored 24h-change %, and the **Bitcoin logo** (not the "B" fallback), and the Total card shows a non-zero value.
- Toggle USD↔EUR → symbol + amounts switch instantly with no visible reload (no fetch).
- Click the refresh button → spinner animates during the fetch.
- Confirm no uncaught console errors beyond the known favicon 404.
Capture a screenshot for the record.

- [ ] **Step 4: Update the README**

Edit `cryptofolio-web/README.md`: under Status, mark Phase 2 done and document the dev command:

```markdown
## Status
- Phase 1 (foundation): holdings CRUD, grouping/sorting, theme, localStorage — DONE
- Phase 2 (live data): CoinGecko prices + images via Pages Functions proxy (Cache API),
  keep-last-known on rate-limit, manual refresh — DONE
- Phase 3 (historical charts) — planned

## Develop
- `npm install`
- `npm run dev` — Wrangler serves the SPA + /api Functions on one origin (prod parity)
- `npm run dev:vite` — Vite only (UI work; /api calls 404)
- `npm test` — Vitest
- `npm run typecheck:functions` — type-check the Pages Functions (Workers types)
- `npm run build` — app type-check + production build to `dist/`
- `npx wrangler pages dev dist` — serve the built app + Functions locally
```

- [ ] **Step 5: Commit**

```bash
git add cryptofolio-web/README.md
git commit -m "docs: Phase 2 complete — live data via Pages Functions proxy"
```

---

## Self-Review

**Spec coverage:**
- `/api/prices` + `/api/images` Functions with Cache API, fresh-hit / stale-refetch / stale-on-429 / cold-429 / ids-validation → Tasks 1–2. ✓
- Shared caching via long retention + `x-cached-at` freshness → Task 1 `cacheProxy`. ✓
- Sorted/de-duped cache key → Task 1 `parseIds`. ✓
- Client `lib/coingecko.ts` with typed `RateLimitedError` → Task 3. ✓
- Store `fetchPrices`: populate prices/images, `lastUpdated` on success, keep-last-known + `errorMessage` on error, best-effort silent images, empty no-op → Task 4. ✓
- Triggers: mount + coin-id-set change + manual button; NO fetch on currency switch → Task 5 (React layer; store actions stay side-effect-free). ✓
- UI: refresh button (spins/disabled while loading), dismissible error banner, first-load skeleton, live logos/values → Task 5. ✓
- Local dev `wrangler pages dev -- vite`, functions typecheck config → Task 2. ✓
- Testing incl. real browser smoke → Tasks 1–6. ✓
- Out of scope (history/charts, polling) — intentionally absent. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; the only prose-only edits (Task 5 Steps 4–6) give exact classes, props, and insertion points against files quoted verbatim from the current tree.

**Type consistency:** `cacheProxy(config, deps)` / `ProxyConfig` / `ProxyDeps` / `CacheLike` identical across Task 1 def and Task 2 use. `fetchPrices`/`fetchImages`/`RateLimitedError` signatures identical across Tasks 3→4. Store action name `fetchPrices` matches between Task 4 (store) and Task 5 (React). `AppShell` new props `onRefresh`/`isRefreshing` defined in Task 5 Step 4 and passed in Step 5. `priceFor` returns `number | undefined` (Phase 1) — Task 5's skeleton relies on the `undefined` case, consistent.

**Note on `fetchPrices` in two namespaces:** the client module exports `fetchPrices` (Task 3) and the store exposes a `fetchPrices` action (Task 4). The store imports the client as `import * as coingecko` and calls `coingecko.fetchPrices`, so there is no shadowing — deliberate and consistent.
