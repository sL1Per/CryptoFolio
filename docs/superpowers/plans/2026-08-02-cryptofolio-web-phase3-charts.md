# CryptoFolio Web Phase 3 — Historical Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline, collapsible portfolio-history chart (7D/1M/1Y/5Y) to the web app, backed by a new `/api/history/[id]` caching proxy and a faithful port of the native two-phase chart-fetch state machine.

**Architecture:** The client owns all chart logic — a localStorage chart cache (`lib/cache.ts`), a pure aggregation (`lib/portfolioHistory.ts`), a client fetch wrapper (`lib/coingecko.ts`), and a Zustand state machine (`fetchHistoricalData`) that renders cache first and never blanks. A thin Pages Function (`functions/api/history/[id].ts`) proxies CoinGecko `/market_chart` through the shared `cacheProxy`. UI lives in `components/chart/` and mounts on `PortfolioPage`.

**Tech Stack:** Vite + React 19 + TypeScript 5.6, Zustand 4, Recharts 3 (new), Cloudflare Pages Functions (workerd), Vitest 4, Tailwind 3.

## Global Constraints

- **Working dir:** all web work is in `cryptofolio-web/`. Run all `npm` commands from there. Git commits run from repo root `/Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp`.
- **CoinGecko upstream (workerd):** every upstream `fetch` MUST send `User-Agent: 'CryptoFolio/1.0 (+https://cryptofolio.app)'` and `Accept: 'application/json'` — workerd sends no UA and CoinGecko returns 403 without one.
- **Browser cache:** `/api/*` responses returned to the browser MUST be `Cache-Control: no-store`; the long `max-age` lives only on the edge Cache API copy. (Already handled inside `cacheProxy`.)
- **Cache TTL per range:** 7D → 10 min, 1M → 1 h, 1Y → 6 h, 5Y → 24 h. Both the server `freshTtlMs` and the client cache use these exact values.
- **Chart cache:** in-memory key format `"coinId|currency|range"`; localStorage storage key `"cryptofolio_chartcache_v1"`; serialized as a JSON array of entries.
- **CoinGecko timestamps are milliseconds.** `market_chart.prices` is `[[ms, price], …]`.
- **No hardcoded colors in components** — use existing Tailwind theme tokens / CSS vars (`text-gold`, `text-green`, `text-red`, `border-border`, `var(--gold-card-bg)`, etc.).
- **Dependency policy:** latest majors; after any `npm install`, `npm audit` must stay at 0 vulnerabilities. Pinned on purpose: Tailwind 3, TS 5, react-router 8, wrangler 4 — do not bump these.
- **Faithful port:** logic mirrors `cryptofolio-MacOS/PortfolioViewModel.swift` `fetchHistoricalData` / `buildPortfolioDataPoints` and `PortfolioChartView.swift`. When in doubt, match native behavior exactly.
- **TDD:** write the failing test first, watch it fail, implement minimally, watch it pass, commit.

---

## Task 1: cacheProxy — distinguish 429 from other upstream errors

Folds in a deferred Phase-2 cleanup: today `cacheProxy` labels ALL cold-path upstream failures `{ error: 'rate_limited' }` with status 429. Charts branch on 429 specifically, so a non-429 upstream failure must be reported distinctly.

**Files:**
- Modify: `cryptofolio-web/functions/api/_lib/cacheProxy.ts`
- Test: `cryptofolio-web/functions/api/_lib/cacheProxy.test.ts`

**Interfaces:**
- Consumes: existing `cacheProxy(config, deps)` signature (unchanged).
- Produces: cold-path behavior — upstream 429 → `{ error: 'rate_limited' }` status 429, `x-cache-status: rate-limited`; any other failure (non-ok status or network throw) → `{ error: 'upstream_error' }` status 502, `x-cache-status: error`. Stale-serving path is unchanged.

- [ ] **Step 1: Add failing tests for the new distinction**

Add these two tests inside the `describe('cacheProxy', …)` block in `cacheProxy.test.ts` (keep the existing `cold + upstream 429` test — it still asserts `rate_limited`/429):

```ts
  it('cold + upstream 500: returns 502 upstream_error json', async () => {
    const { cache } = fakeCache()
    const fetchUpstream = vi.fn(async () => new Response('', { status: 500 }))
    const res = await cacheProxy(CFG, { cache, fetchUpstream, now: () => 1000 })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'upstream_error' })
    expect(res.headers.get('x-cache-status')).toBe('error')
  })

  it('cold + network throw: returns 502 upstream_error json', async () => {
    const { cache } = fakeCache()
    const fetchUpstream = vi.fn(async () => { throw new Error('boom') })
    const res = await cacheProxy(CFG, { cache, fetchUpstream, now: () => 1000 })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'upstream_error' })
  })

  it('cold + upstream 429: still returns 429 rate_limited json', async () => {
    const { cache } = fakeCache()
    const fetchUpstream = vi.fn(async () => new Response('', { status: 429 }))
    const res = await cacheProxy(CFG, { cache, fetchUpstream, now: () => 1000 })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'rate_limited' })
    expect(res.headers.get('x-cache-status')).toBe('rate-limited')
  })
```

- [ ] **Step 2: Run tests to verify the two new failures**

Run: `cd cryptofolio-web && npx vitest run functions/api/_lib/cacheProxy.test.ts`
Expected: the `500` and `network throw` cases FAIL (currently return 429/`rate_limited`); the 429 case may also fail on the new `x-cache-status` assertion.

- [ ] **Step 3: Implement the distinction**

Replace the `try { … } catch { … }` block in `cacheProxy.ts` (currently lines 53-69) with a version that remembers whether the failure was a 429:

```ts
  let upstreamWas429 = false
  try {
    const upstream = await deps.fetchUpstream(config.upstreamUrl)
    if (!upstream.ok) {
      upstreamWas429 = upstream.status === 429
      throw new Error(`upstream ${upstream.status}`)
    }
    const body = config.transform(await upstream.json())
    const edgeResp = jsonResponse(body, {
      'Cache-Control': `public, max-age=${config.retentionSecs}`,
      [CACHED_AT]: String(deps.now()),
      'x-cache-status': 'miss',
    })
    const put = deps.cache.put(key, edgeResp)
    if (deps.waitUntil) deps.waitUntil(put)
    else await put
    return jsonResponse(body, { 'Cache-Control': 'no-store', 'x-cache-status': 'miss' })
  } catch {
    if (cached) return withCacheStatus(cached, 'stale')
    if (upstreamWas429) {
      return jsonResponse({ error: 'rate_limited' }, { 'Cache-Control': 'no-store', 'x-cache-status': 'rate-limited' }, 429)
    }
    return jsonResponse({ error: 'upstream_error' }, { 'Cache-Control': 'no-store', 'x-cache-status': 'error' }, 502)
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cryptofolio-web && npx vitest run functions/api/_lib/cacheProxy.test.ts`
Expected: PASS (all cacheProxy tests, including the pre-existing stale-serving-on-429 case).

- [ ] **Step 5: Commit**

```bash
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp add cryptofolio-web/functions/api/_lib/cacheProxy.ts cryptofolio-web/functions/api/_lib/cacheProxy.test.ts
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp commit -m "fix(functions): distinguish upstream 429 from other errors in cacheProxy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Type-check Functions test files in the build

Folds in a deferred Phase-2 cleanup: Phase-2's TS2493 slipped through because Function `.test.ts` files weren't compiled. Include them so the new history function and its tests are type-checked, and wire the functions typecheck into `build`.

**Files:**
- Modify: `cryptofolio-web/functions/tsconfig.json`
- Modify: `cryptofolio-web/package.json` (the `build` script)

**Interfaces:**
- Produces: `npm run build` now also runs `tsc -p functions/tsconfig.json`; `functions/**/*.test.ts` are type-checked.

- [ ] **Step 1: Stop excluding test files from the Functions tsconfig**

In `cryptofolio-web/functions/tsconfig.json`, change the `include`/`exclude` so tests are compiled and vitest globals resolve. Replace lines 13-14:

```json
  "include": ["api/**/*.ts"],
  "exclude": []
```

Also add `"vitest"` to the `types` array on line 7 so `import … from 'vitest'` in Function tests type-checks:

```json
    "types": ["@cloudflare/workers-types", "vitest/globals"],
```

- [ ] **Step 2: Verify the functions typecheck passes on current code**

Run: `cd cryptofolio-web && npm run typecheck:functions`
Expected: PASS with no output (exit 0). If `vitest/globals` is not found, instead of adding it to `types`, leave `types` as `["@cloudflare/workers-types"]` — the explicit `import { describe, it, expect, vi } from 'vitest'` in the test already resolves the names, so removing the `exclude` alone is sufficient. Re-run and confirm exit 0.

- [ ] **Step 3: Wire functions typecheck into build**

In `cryptofolio-web/package.json`, change the `build` script (line 9) to run the functions typecheck too:

```json
    "build": "tsc -b && tsc -p functions/tsconfig.json && vite build",
```

- [ ] **Step 4: Verify the full build passes**

Run: `cd cryptofolio-web && npm run build`
Expected: PASS — `tsc -b`, the functions typecheck, and `vite build` all succeed.

- [ ] **Step 5: Commit**

```bash
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp add cryptofolio-web/functions/tsconfig.json cryptofolio-web/package.json
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp commit -m "build(functions): type-check function test files in build

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `/api/history/[id]` Pages Function

**Files:**
- Create: `cryptofolio-web/functions/api/history/[id].ts`
- Create: `cryptofolio-web/functions/api/history/history.test.ts`

**Interfaces:**
- Produces (exported for testing):
  - `type HistoryParams = { id: string; days: number; vs: 'usd' | 'eur' }`
  - `validateHistoryRequest(id: string | undefined, days: string | null, vs: string | null): HistoryParams | null` — returns params or `null` if invalid.
  - `historyTransform(json: unknown): { prices: [number, number][] }` — guards malformed JSON, returns `{ prices: [] }` when `prices` is not an array of numeric pairs.
  - `onRequestGet: PagesFunction` — the handler.
- Consumes: `cacheProxy`, `jsonResponse` from `../_lib/cacheProxy`.
- Endpoint: `GET /api/history/:id?days={7|30|365|1825}&vs={usd|eur}` → `{ prices: [ms, price][] }`.

- [ ] **Step 1: Write failing tests for the pure helpers**

Create `cryptofolio-web/functions/api/history/history.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateHistoryRequest, historyTransform } from './[id]'

describe('validateHistoryRequest', () => {
  it('accepts a valid coin id, days, and currency', () => {
    expect(validateHistoryRequest('bitcoin', '7', 'usd')).toEqual({ id: 'bitcoin', days: 7, vs: 'usd' })
    expect(validateHistoryRequest('avalanche-2', '1825', 'eur')).toEqual({ id: 'avalanche-2', days: 1825, vs: 'eur' })
  })
  it('rejects a missing or malformed id', () => {
    expect(validateHistoryRequest(undefined, '7', 'usd')).toBeNull()
    expect(validateHistoryRequest('', '7', 'usd')).toBeNull()
    expect(validateHistoryRequest('bad id!', '7', 'usd')).toBeNull()
    expect(validateHistoryRequest('../etc', '7', 'usd')).toBeNull()
  })
  it('rejects a days value that is not one of the four allowed', () => {
    expect(validateHistoryRequest('bitcoin', '10', 'usd')).toBeNull()
    expect(validateHistoryRequest('bitcoin', null, 'usd')).toBeNull()
  })
  it('rejects a currency other than usd/eur', () => {
    expect(validateHistoryRequest('bitcoin', '7', 'gbp')).toBeNull()
    expect(validateHistoryRequest('bitcoin', '7', null)).toBeNull()
  })
})

describe('historyTransform', () => {
  it('extracts prices from a valid market_chart payload', () => {
    const json = { prices: [[1000, 1.5], [2000, 2.5]], market_caps: [], total_volumes: [] }
    expect(historyTransform(json)).toEqual({ prices: [[1000, 1.5], [2000, 2.5]] })
  })
  it('returns empty prices for malformed payloads', () => {
    expect(historyTransform(null)).toEqual({ prices: [] })
    expect(historyTransform({})).toEqual({ prices: [] })
    expect(historyTransform({ prices: 'nope' })).toEqual({ prices: [] })
    expect(historyTransform({ prices: [[1000], ['a', 'b'], [1, 2]] })).toEqual({ prices: [[1, 2]] })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cryptofolio-web && npx vitest run functions/api/history/history.test.ts`
Expected: FAIL — module `./[id]` cannot be resolved / exports undefined.

- [ ] **Step 3: Implement the function**

Create `cryptofolio-web/functions/api/history/[id].ts`:

```ts
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
```

- [ ] **Step 4: Run tests + functions typecheck**

Run: `cd cryptofolio-web && npx vitest run functions/api/history/history.test.ts && npm run typecheck:functions`
Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp add cryptofolio-web/functions/api/history/
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp commit -m "feat(functions): add /api/history/[id] market_chart proxy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Runtime guard on the images transform

Folds in the last deferred Phase-2 cleanup: `/api/images` transform assumes a well-formed array.

**Files:**
- Modify: `cryptofolio-web/functions/api/images.ts:16`

**Interfaces:** unchanged output (`Record<coinId, imageUrl>`), but malformed upstream JSON now yields `{}` instead of throwing.

- [ ] **Step 1: Replace the transform with a guarded version**

In `cryptofolio-web/functions/api/images.ts`, replace line 16:

```ts
      transform: (j) =>
        Object.fromEntries(
          (Array.isArray(j) ? (j as Market[]) : [])
            .filter((m) => m && typeof m.id === 'string' && typeof m.image === 'string')
            .map((m) => [m.id, m.image]),
        ),
```

- [ ] **Step 2: Verify functions typecheck + existing tests still pass**

Run: `cd cryptofolio-web && npm run typecheck:functions && npx vitest run functions/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp add cryptofolio-web/functions/api/images.ts
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp commit -m "fix(functions): guard images transform against malformed upstream json

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Types + chart cache module (`lib/cache.ts`)

**Files:**
- Modify: `cryptofolio-web/src/types/index.ts` (change `PortfolioDataPoint.date` to `number`; add `HistoryPoint`)
- Create: `cryptofolio-web/src/lib/cache.ts`
- Create: `cryptofolio-web/src/lib/cache.test.ts`

**Interfaces:**
- Produces:
  - `interface HistoryPoint { ts: number; price: number }` (in `types`)
  - `PortfolioDataPoint = { date: number; value: number }` (date is ms epoch — changed from `Date`)
  - `type ChartCache = Record<string, ChartCacheEntry>`
  - `interface ChartCacheEntry { coinId: string; currency: Currency; range: TimeRange; fetchedAt: number; points: HistoryPoint[] }`
  - `CHART_TTL_MS: Record<TimeRange, number>` = `{ '7D':600000, '1M':3600000, '1Y':21600000, '5Y':86400000 }`
  - `chartCacheKey(coinId: string, currency: Currency, range: TimeRange): string` → `"coinId|currency|range"`
  - `isCacheValid(entry: ChartCacheEntry, now: number): boolean`
  - `loadChartCache(): ChartCache`
  - `saveChartCache(cache: ChartCache): void`
- Consumes: `Currency`, `TimeRange` from `types`.

- [ ] **Step 1: Update types**

In `cryptofolio-web/src/types/index.ts`, change the `PortfolioDataPoint` interface (lines 34-37) and add `HistoryPoint`:

```ts
export interface PortfolioDataPoint {
  date: number // ms epoch
  value: number
}

export interface HistoryPoint {
  ts: number // ms epoch
  price: number
}
```

- [ ] **Step 2: Write failing tests**

Create `cryptofolio-web/src/lib/cache.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd cryptofolio-web && npx vitest run src/lib/cache.test.ts`
Expected: FAIL — `./cache` not found.

- [ ] **Step 4: Implement `lib/cache.ts`**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cryptofolio-web && npx vitest run src/lib/cache.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp add cryptofolio-web/src/types/index.ts cryptofolio-web/src/lib/cache.ts cryptofolio-web/src/lib/cache.test.ts
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp commit -m "feat(chart): localStorage chart cache with per-range TTL

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Portfolio history aggregation (`lib/portfolioHistory.ts`)

Faithful port of the Swift `buildPortfolioDataPoints`: longest history is the reference axis; per coin use exact-timestamp price else nearest-timestamp; sum `price × amount`; emit a point only if ≥1 coin contributed.

**Files:**
- Create: `cryptofolio-web/src/lib/portfolioHistory.ts`
- Create: `cryptofolio-web/src/lib/portfolioHistory.test.ts`

**Interfaces:**
- Produces: `buildPortfolioDataPoints(coinHistories: Record<string, HistoryPoint[]>, amountByCoin: Record<string, number>): PortfolioDataPoint[]` — sorted ascending by `date`.
- Consumes: `HistoryPoint`, `PortfolioDataPoint` from `types`.

- [ ] **Step 1: Write failing tests**

Create `cryptofolio-web/src/lib/portfolioHistory.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildPortfolioDataPoints } from './portfolioHistory'
import type { HistoryPoint } from '../types'

const pts = (...pairs: [number, number][]): HistoryPoint[] => pairs.map(([ts, price]) => ({ ts, price }))

describe('buildPortfolioDataPoints', () => {
  it('returns empty for no histories', () => {
    expect(buildPortfolioDataPoints({}, { bitcoin: 1 })).toEqual([])
  })

  it('sums price*amount per timestamp across coins', () => {
    const histories = { bitcoin: pts([1000, 10], [2000, 20]), ethereum: pts([1000, 1], [2000, 2]) }
    const out = buildPortfolioDataPoints(histories, { bitcoin: 2, ethereum: 3 })
    expect(out).toEqual([
      { date: 1000, value: 2 * 10 + 3 * 1 },
      { date: 2000, value: 2 * 20 + 3 * 2 },
    ])
  })

  it('uses the longest history as the reference axis and nearest-timestamp for shorter ones', () => {
    // bitcoin has 3 points (reference); ethereum has 1 point → nearest for every ref ts
    const histories = { bitcoin: pts([1000, 10], [2000, 20], [3000, 30]), ethereum: pts([2100, 5]) }
    const out = buildPortfolioDataPoints(histories, { bitcoin: 1, ethereum: 1 })
    expect(out.map((p) => p.date)).toEqual([1000, 2000, 3000])
    // ethereum only point (5) is nearest for all three ref timestamps
    expect(out).toEqual([
      { date: 1000, value: 10 + 5 },
      { date: 2000, value: 20 + 5 },
      { date: 3000, value: 30 + 5 },
    ])
  })

  it('ignores coins with no amount held and returns sorted output', () => {
    const histories = { bitcoin: pts([2000, 20], [1000, 10]) }
    const out = buildPortfolioDataPoints(histories, { bitcoin: 1, ethereum: 4 })
    expect(out).toEqual([
      { date: 1000, value: 10 },
      { date: 2000, value: 20 },
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cryptofolio-web && npx vitest run src/lib/portfolioHistory.test.ts`
Expected: FAIL — `./portfolioHistory` not found.

- [ ] **Step 3: Implement `lib/portfolioHistory.ts`**

```ts
import type { HistoryPoint, PortfolioDataPoint } from '../types'

export function buildPortfolioDataPoints(
  coinHistories: Record<string, HistoryPoint[]>,
  amountByCoin: Record<string, number>,
): PortfolioDataPoint[] {
  const ids = Object.keys(coinHistories)
  if (ids.length === 0) return []

  // Reference axis = timestamps of the longest history.
  let refTimestamps: number[] = []
  for (const id of ids) {
    if (coinHistories[id].length > refTimestamps.length) {
      refTimestamps = coinHistories[id].map((p) => p.ts)
    }
  }
  if (refTimestamps.length === 0) return []

  // Exact-timestamp lookups per coin.
  const lookups: Record<string, Map<number, number>> = {}
  for (const id of ids) {
    lookups[id] = new Map(coinHistories[id].map((p) => [p.ts, p.price]))
  }

  const points: PortfolioDataPoint[] = []
  for (const ts of refTimestamps) {
    let total = 0
    let hasAny = false
    for (const id of ids) {
      const amount = amountByCoin[id]
      if (!amount) continue
      const lk = lookups[id]
      let price = lk.get(ts)
      if (price === undefined) {
        // Nearest timestamp.
        let bestKey: number | undefined
        let bestDist = Infinity
        for (const k of lk.keys()) {
          const d = Math.abs(k - ts)
          if (d < bestDist) { bestDist = d; bestKey = k }
        }
        if (bestKey === undefined) continue
        price = lk.get(bestKey)!
      }
      total += price * amount
      hasAny = true
    }
    if (hasAny) points.push({ date: ts, value: total })
  }

  return points.sort((a, b) => a.date - b.date)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cryptofolio-web && npx vitest run src/lib/portfolioHistory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp add cryptofolio-web/src/lib/portfolioHistory.ts cryptofolio-web/src/lib/portfolioHistory.test.ts
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp commit -m "feat(chart): portfolio history aggregation (nearest-timestamp port)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Client history fetch (`lib/coingecko.ts`)

**Files:**
- Modify: `cryptofolio-web/src/lib/coingecko.ts`
- Create: `cryptofolio-web/src/lib/coingecko.history.test.ts`

**Interfaces:**
- Produces: `fetchCoinHistory(id: string, range: TimeRange, currency: Currency): Promise<HistoryResult>` where
  `type HistoryResult = { ok: true; points: HistoryPoint[] } | { ok: false; rateLimited: boolean }`.
  Calls `GET /api/history/{id}?days={TIME_RANGE_DAYS[range]}&vs={currency}`; 429 → `{ ok:false, rateLimited:true }`; any other non-ok or thrown error → `{ ok:false, rateLimited:false }`; success maps `{prices:[ts,price][]}` to `HistoryPoint[]`.
- Consumes: `TimeRange`, `Currency`, `HistoryPoint` from `types`; `TIME_RANGE_DAYS` from `constants`.

- [ ] **Step 1: Write failing tests**

Create `cryptofolio-web/src/lib/coingecko.history.test.ts`:

```ts
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
    expect(spy).toHaveBeenCalledWith('/api/history/bitcoin?days=365&vs=eur')
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cryptofolio-web && npx vitest run src/lib/coingecko.history.test.ts`
Expected: FAIL — `fetchCoinHistory` not exported.

- [ ] **Step 3: Implement — append to `lib/coingecko.ts`**

Add these imports at the top (merge with existing `import type` line) and the new function at the bottom:

```ts
import type { CoinPrice, TimeRange, Currency, HistoryPoint } from '../types'
import { TIME_RANGE_DAYS } from './constants'

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
```

Note: the existing top line is `import type { CoinPrice } from '../types'` — replace it with the merged import above (do not duplicate the import).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cryptofolio-web && npx vitest run src/lib/coingecko.history.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp add cryptofolio-web/src/lib/coingecko.ts cryptofolio-web/src/lib/coingecko.history.test.ts
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp commit -m "feat(chart): client fetchCoinHistory with 429 discrimination

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Store — chart state + `fetchHistoricalData` state machine

Faithful port of the native two-phase machine (cache-first render, sequential 1.5 s fetches, 429 → wait 15 s → retry once → stop, never blank, error only when empty).

**Files:**
- Modify: `cryptofolio-web/src/store/portfolioStore.ts`
- Create: `cryptofolio-web/src/store/chartFetch.test.ts`

**Interfaces:**
- Produces (added to `PortfolioState`):
  - state: `selectedTimeRange: TimeRange` (default `'7D'`), `historicalData: PortfolioDataPoint[]`, `isLoadingChart: boolean`, `chartError: string | null`, `chartLoadingStatus: string`, `chartCachedAt: number | null`, `chartIsStale: boolean`, `chartCache: ChartCache` (non-persisted).
  - actions: `setTimeRange(range: TimeRange): void`, `fetchHistoricalData(forceRefresh?: boolean): Promise<void>`.
- Consumes: `fetchCoinHistory` from `lib/coingecko`; `lib/cache` helpers; `buildPortfolioDataPoints` from `lib/portfolioHistory`.
- Timing constants (module-level in store, overridable for tests via export): `FETCH_SPACING_MS = 1500`, `RATE_LIMIT_WAIT_MS = 15000`.

- [ ] **Step 1: Write failing tests for the state machine**

Create `cryptofolio-web/src/store/chartFetch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePortfolioStore } from './portfolioStore'
import * as coingecko from '../lib/coingecko'
import { POPULAR_COINS } from '../lib/constants'

const BTC = POPULAR_COINS[0] // bitcoin
const ETH = POPULAR_COINS[1] // ethereum

function reset() {
  localStorage.clear()
  usePortfolioStore.setState({
    holdings: [], currency: 'usd', selectedTimeRange: '7D',
    historicalData: [], isLoadingChart: false, chartError: null,
    chartLoadingStatus: '', chartCachedAt: null, chartIsStale: false, chartCache: {},
  })
}

beforeEach(() => { reset(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('fetchHistoricalData', () => {
  it('does nothing with no holdings', async () => {
    await usePortfolioStore.getState().fetchHistoricalData()
    expect(usePortfolioStore.getState().historicalData).toEqual([])
  })

  it('fetches stale coins sequentially and builds portfolio points', async () => {
    usePortfolioStore.getState().addHolding(BTC, 2, 'coinbase')
    const spy = vi.spyOn(coingecko, 'fetchCoinHistory').mockResolvedValue({
      ok: true, points: [{ ts: 1000, price: 10 }, { ts: 2000, price: 20 }],
    })
    const p = usePortfolioStore.getState().fetchHistoricalData()
    await vi.runAllTimersAsync()
    await p
    expect(spy).toHaveBeenCalledWith('bitcoin', '7D', 'usd')
    expect(usePortfolioStore.getState().historicalData).toEqual([
      { date: 1000, value: 20 }, { date: 2000, value: 40 },
    ])
    expect(usePortfolioStore.getState().isLoadingChart).toBe(false)
    expect(usePortfolioStore.getState().chartIsStale).toBe(false)
    expect(usePortfolioStore.getState().chartError).toBeNull()
  })

  it('spaces multiple coin fetches 1.5s apart', async () => {
    usePortfolioStore.getState().addHolding(BTC, 1, 'coinbase')
    usePortfolioStore.getState().addHolding(ETH, 1, 'coinbase')
    const spy = vi.spyOn(coingecko, 'fetchCoinHistory').mockResolvedValue({ ok: true, points: [{ ts: 1000, price: 1 }] })
    const p = usePortfolioStore.getState().fetchHistoricalData()
    await vi.advanceTimersByTimeAsync(0)
    expect(spy).toHaveBeenCalledTimes(1) // first coin immediately
    await vi.advanceTimersByTimeAsync(1500)
    expect(spy).toHaveBeenCalledTimes(2) // second after 1.5s
    await vi.runAllTimersAsync(); await p
  })

  it('on 429 waits 15s, retries once, and keeps data on success', async () => {
    usePortfolioStore.getState().addHolding(BTC, 1, 'coinbase')
    const spy = vi.spyOn(coingecko, 'fetchCoinHistory')
      .mockResolvedValueOnce({ ok: false, rateLimited: true })
      .mockResolvedValueOnce({ ok: true, points: [{ ts: 1000, price: 5 }] })
    const p = usePortfolioStore.getState().fetchHistoricalData()
    await vi.runAllTimersAsync(); await p
    expect(spy).toHaveBeenCalledTimes(2)
    expect(usePortfolioStore.getState().historicalData).toEqual([{ date: 1000, value: 5 }])
    expect(usePortfolioStore.getState().chartError).toBeNull()
  })

  it('sets an error only when nothing is available after a double 429', async () => {
    usePortfolioStore.getState().addHolding(BTC, 1, 'coinbase')
    vi.spyOn(coingecko, 'fetchCoinHistory').mockResolvedValue({ ok: false, rateLimited: true })
    const p = usePortfolioStore.getState().fetchHistoricalData()
    await vi.runAllTimersAsync(); await p
    expect(usePortfolioStore.getState().historicalData).toEqual([])
    expect(usePortfolioStore.getState().chartError).toBe('Rate limited. Try again in a minute.')
  })

  it('renders cache first and skips fetching when cache is fresh', async () => {
    usePortfolioStore.getState().addHolding(BTC, 1, 'coinbase')
    usePortfolioStore.setState({
      chartCache: { 'bitcoin|usd|7D': { coinId: 'bitcoin', currency: 'usd', range: '7D', fetchedAt: Date.now(), points: [{ ts: 1000, price: 9 }] } },
    })
    const spy = vi.spyOn(coingecko, 'fetchCoinHistory')
    const p = usePortfolioStore.getState().fetchHistoricalData()
    await vi.runAllTimersAsync(); await p
    expect(spy).not.toHaveBeenCalled()
    expect(usePortfolioStore.getState().historicalData).toEqual([{ date: 1000, value: 9 }])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cryptofolio-web && npx vitest run src/store/chartFetch.test.ts`
Expected: FAIL — `fetchHistoricalData` / `setTimeRange` / chart state undefined.

- [ ] **Step 3: Implement — extend `portfolioStore.ts`**

Add imports (merge with existing import lines at the top):

```ts
import type { Coin, CoinPrice, Currency, GroupMode, Holding, SortMode, TimeRange, PortfolioDataPoint } from '../types'
import { fetchCoinHistory } from '../lib/coingecko'
import {
  loadChartCache, saveChartCache, chartCacheKey, isCacheValid, type ChartCache, type ChartCacheEntry,
} from '../lib/cache'
import { buildPortfolioDataPoints } from '../lib/portfolioHistory'
```

Add module-level timing constants above `usePortfolioStore` (exported so tests could tune them if needed):

```ts
export const FETCH_SPACING_MS = 1500
export const RATE_LIMIT_WAIT_MS = 15000
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
```

Extend the `PortfolioState` interface with the new fields and actions:

```ts
  // Chart (transient — not persisted)
  selectedTimeRange: TimeRange
  historicalData: PortfolioDataPoint[]
  isLoadingChart: boolean
  chartError: string | null
  chartLoadingStatus: string
  chartCachedAt: number | null
  chartIsStale: boolean
  chartCache: ChartCache

  setTimeRange: (range: TimeRange) => void
  fetchHistoricalData: (forceRefresh?: boolean) => Promise<void>
```

Add the initial values inside the store factory (next to `errorMessage: null`):

```ts
      selectedTimeRange: '7D',
      historicalData: [],
      isLoadingChart: false,
      chartError: null,
      chartLoadingStatus: '',
      chartCachedAt: null,
      chartIsStale: false,
      chartCache: loadChartCache(),
```

Add the actions inside the store factory (after `fetchPrices`):

```ts
      setTimeRange: (selectedTimeRange) => set({ selectedTimeRange }),

      fetchHistoricalData: async (forceRefresh = false) => {
        const { holdings, currency, selectedTimeRange: range } = get()
        if (holdings.length === 0) { set({ historicalData: [] }); return }

        const cur = currency
        const uniqueIds = [...new Set(holdings.map((h) => h.coin.id))]
        const amountByCoin: Record<string, number> = {}
        for (const h of holdings) amountByCoin[h.coin.id] = (amountByCoin[h.coin.id] ?? 0) + h.amount

        const now = () => Date.now()
        const keyOf = (id: string) => chartCacheKey(id, cur, range)

        // Build a histories dict from whatever is cached (ignoring TTL).
        const historiesFromCache = (cache: ChartCache) => {
          const result: Record<string, { ts: number; price: number }[]> = {}
          for (const id of uniqueIds) {
            const entry = cache[keyOf(id)]
            if (entry) result[id] = entry.points
          }
          return result
        }
        const cachedAtOf = (cache: ChartCache, ids: string[]) => {
          const stamps = ids.map((id) => cache[keyOf(id)]?.fetchedAt).filter((v): v is number => v != null)
          return stamps.length ? Math.min(...stamps) : null
        }
        const stalenessOf = (cache: ChartCache) =>
          uniqueIds.some((id) => {
            const entry = cache[keyOf(id)]
            return !entry || !isCacheValid(entry, now())
          })

        // Step 1: render cache first, always.
        let cache = get().chartCache
        const cachedHistories = historiesFromCache(cache)
        if (Object.keys(cachedHistories).length > 0) {
          set({
            historicalData: buildPortfolioDataPoints(cachedHistories, amountByCoin),
            chartCachedAt: cachedAtOf(cache, Object.keys(cachedHistories)),
            chartIsStale: stalenessOf(cache),
            chartError: null,
          })
        }

        // Step 2: which coins need fetching?
        const staleIds = uniqueIds.filter((id) => {
          const entry = cache[keyOf(id)]
          return forceRefresh || !entry || !isCacheValid(entry, now())
        })
        if (staleIds.length === 0) {
          set({ isLoadingChart: false, chartLoadingStatus: '', chartIsStale: false })
          return
        }

        set({ isLoadingChart: true })

        const accumulated: Record<string, { ts: number; price: number }[]> = { ...cachedHistories }
        const writeEntry = (id: string, points: { ts: number; price: number }[]) => {
          const entry: ChartCacheEntry = { coinId: id, currency: cur, range, fetchedAt: now(), points }
          cache = { ...cache, [keyOf(id)]: entry }
          set({ chartCache: cache })
          saveChartCache(cache)
          accumulated[id] = points
          set({
            historicalData: buildPortfolioDataPoints(accumulated, amountByCoin),
            chartCachedAt: cachedAtOf(cache, Object.keys(accumulated)),
          })
        }

        for (let i = 0; i < staleIds.length; i++) {
          const id = staleIds[i]
          const displayId = id.toUpperCase().replace('-2', '').replace('-NETWORK', '')
          set({ chartLoadingStatus: `Updating ${displayId}… (${i + 1}/${staleIds.length})` })
          if (i > 0) await sleep(FETCH_SPACING_MS)

          const result = await fetchCoinHistory(id, range, cur)
          if (result.ok) {
            writeEntry(id, result.points)
          } else if (result.rateLimited) {
            set({ chartLoadingStatus: 'Rate limited — waiting 15s to retry…' })
            await sleep(RATE_LIMIT_WAIT_MS)
            const retry = await fetchCoinHistory(id, range, cur)
            if (retry.ok) {
              writeEntry(id, retry.points)
            } else {
              set({ chartLoadingStatus: '' })
              if (get().historicalData.length === 0) set({ chartError: 'Rate limited. Try again in a minute.' })
              break
            }
          } else {
            if (get().historicalData.length === 0) set({ chartError: 'Could not load chart data.' })
          }
        }

        set({ isLoadingChart: false, chartLoadingStatus: '', chartIsStale: stalenessOf(cache) })
      },
```

Note: leave `partialize` unchanged (it already lists only holdings/currency/groupMode/sortMode, so all chart state stays transient and `chartCache` persists separately via `lib/cache.ts`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cryptofolio-web && npx vitest run src/store/chartFetch.test.ts`
Expected: PASS (all six cases).

- [ ] **Step 5: Run the full test suite + typecheck to catch regressions**

Run: `cd cryptofolio-web && npm test && npx tsc -b`
Expected: PASS — existing store tests unaffected, no type errors.

- [ ] **Step 6: Commit**

```bash
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp add cryptofolio-web/src/store/portfolioStore.ts cryptofolio-web/src/store/chartFetch.test.ts
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp commit -m "feat(chart): fetchHistoricalData two-phase state machine in store

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Pure chart helpers (`components/chart/chartHelpers.ts`)

Extract the pure presentational math from the native chart so it is unit-tested (the Recharts SVG render is verified in the browser, not jsdom).

**Files:**
- Create: `cryptofolio-web/src/components/chart/chartHelpers.ts`
- Create: `cryptofolio-web/src/components/chart/chartHelpers.test.ts`

**Interfaces:**
- Produces:
  - `periodChangePct(data: PortfolioDataPoint[]): number | null` — `(last-first)/first*100`, null if <2 points or first ≤ 0.
  - `absoluteChange(data: PortfolioDataPoint[]): number | null` — `last-first`, null if <2 points.
  - `chartStats(data: PortfolioDataPoint[]): { start: number|null; current: number|null; peak: number|null; low: number|null }`.
  - `axisCurrency(value: number, symbol: string): string` — K/M compaction.
  - `xTickLabel(ms: number, range: TimeRange): string`.
- Consumes: `PortfolioDataPoint`, `TimeRange` from `types`.

- [ ] **Step 1: Write failing tests**

Create `cryptofolio-web/src/components/chart/chartHelpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { periodChangePct, absoluteChange, chartStats, axisCurrency, xTickLabel } from './chartHelpers'
import type { PortfolioDataPoint } from '../../types'

const d = (...vals: number[]): PortfolioDataPoint[] => vals.map((value, i) => ({ date: 1000 + i, value }))

describe('periodChangePct / absoluteChange', () => {
  it('computes percent and absolute change', () => {
    expect(periodChangePct(d(100, 150))).toBeCloseTo(50)
    expect(absoluteChange(d(100, 150))).toBe(50)
  })
  it('returns null for insufficient or zero-base data', () => {
    expect(periodChangePct(d(100))).toBeNull()
    expect(periodChangePct(d(0, 10))).toBeNull()
    expect(absoluteChange([])).toBeNull()
  })
})

describe('chartStats', () => {
  it('reports start/current/peak/low', () => {
    expect(chartStats(d(100, 300, 50, 200))).toEqual({ start: 100, current: 200, peak: 300, low: 50 })
  })
  it('is all null for empty data', () => {
    expect(chartStats([])).toEqual({ start: null, current: null, peak: null, low: null })
  })
})

describe('axisCurrency', () => {
  it('compacts thousands and millions', () => {
    expect(axisCurrency(950, '$')).toBe('$950')
    expect(axisCurrency(12_500, '$')).toBe('$13K')
    expect(axisCurrency(2_300_000, '€')).toBe('€2.3M')
  })
})

describe('xTickLabel', () => {
  it('formats per range without throwing', () => {
    const ms = Date.UTC(2026, 7, 4) // 2026-08-04
    expect(xTickLabel(ms, '5Y')).toBe('2026')
    expect(typeof xTickLabel(ms, '7D')).toBe('string')
    expect(typeof xTickLabel(ms, '1M')).toBe('string')
    expect(typeof xTickLabel(ms, '1Y')).toBe('string')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cryptofolio-web && npx vitest run src/components/chart/chartHelpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `chartHelpers.ts`**

```ts
import type { PortfolioDataPoint, TimeRange } from '../../types'

export function periodChangePct(data: PortfolioDataPoint[]): number | null {
  if (data.length < 2) return null
  const first = data[0].value
  const last = data[data.length - 1].value
  if (first <= 0) return null
  return ((last - first) / first) * 100
}

export function absoluteChange(data: PortfolioDataPoint[]): number | null {
  if (data.length < 2) return null
  return data[data.length - 1].value - data[0].value
}

export function chartStats(data: PortfolioDataPoint[]): {
  start: number | null; current: number | null; peak: number | null; low: number | null
} {
  if (data.length === 0) return { start: null, current: null, peak: null, low: null }
  const values = data.map((p) => p.value)
  return {
    start: data[0].value,
    current: data[data.length - 1].value,
    peak: Math.max(...values),
    low: Math.min(...values),
  }
}

export function axisCurrency(value: number, symbol: string): string {
  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${symbol}${(value / 1_000).toFixed(0)}K`
  return `${symbol}${value.toFixed(0)}`
}

export function xTickLabel(ms: number, range: TimeRange): string {
  const date = new Date(ms)
  switch (range) {
    case '7D': return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
    case '1M': return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    case '1Y': return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    case '5Y': return String(date.getFullYear())
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cryptofolio-web && npx vitest run src/components/chart/chartHelpers.test.ts`
Expected: PASS. (Note: `xTickLabel('5Y')` uses local `getFullYear`; the test builds the ms with `Date.UTC` for a mid-day date so the local year is unambiguous.)

- [ ] **Step 5: Commit**

```bash
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp add cryptofolio-web/src/components/chart/chartHelpers.ts cryptofolio-web/src/components/chart/chartHelpers.test.ts
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp commit -m "feat(chart): pure chart helper functions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Presentational chart pieces — `TimeRangePicker` + `ChartStatsBar`

**Files:**
- Create: `cryptofolio-web/src/components/chart/TimeRangePicker.tsx`
- Create: `cryptofolio-web/src/components/chart/ChartStatsBar.tsx`
- Create: `cryptofolio-web/src/components/chart/ChartStatsBar.test.tsx`

**Interfaces:**
- Produces:
  - `TimeRangePicker({ value, onChange }: { value: TimeRange; onChange: (r: TimeRange) => void })` — reuses `SegmentedControl` with the 4 ranges.
  - `ChartStatsBar({ data, currency }: { data: PortfolioDataPoint[]; currency: Currency })` — START/CURRENT/PEAK/LOW/ABS CHANGE cells.
- Consumes: `SegmentedControl` from `../ui/SegmentedControl`; `chartStats`, `absoluteChange` from `./chartHelpers`; `formatCurrency` from `../../lib/formatters`.

- [ ] **Step 1: Write failing test for ChartStatsBar**

Create `cryptofolio-web/src/components/chart/ChartStatsBar.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChartStatsBar } from './ChartStatsBar'
import type { PortfolioDataPoint } from '../../types'

const data: PortfolioDataPoint[] = [
  { date: 1000, value: 100 }, { date: 2000, value: 300 }, { date: 3000, value: 200 },
]

describe('ChartStatsBar', () => {
  it('renders the five labeled stats with formatted values', () => {
    render(<ChartStatsBar data={data} currency="usd" />)
    expect(screen.getByText('START')).toBeInTheDocument()
    expect(screen.getByText('$100.00')).toBeInTheDocument() // start
    expect(screen.getByText('$300.00')).toBeInTheDocument() // peak
    expect(screen.getByText('ABS. CHANGE')).toBeInTheDocument()
    expect(screen.getByText('$100.00')).toBeInTheDocument() // abs change |200-100|
  })
  it('shows dashes when there is no data', () => {
    render(<ChartStatsBar data={[]} currency="usd" />)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cryptofolio-web && npx vitest run src/components/chart/ChartStatsBar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TimeRangePicker.tsx`**

```tsx
import type { TimeRange } from '../../types'
import { SegmentedControl } from '../ui/SegmentedControl'

const OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '7D', label: '7D' }, { value: '1M', label: '1M' }, { value: '1Y', label: '1Y' }, { value: '5Y', label: '5Y' },
]

export function TimeRangePicker({ value, onChange }: { value: TimeRange; onChange: (r: TimeRange) => void }) {
  return <SegmentedControl options={OPTIONS} value={value} onChange={onChange} />
}
```

- [ ] **Step 4: Implement `ChartStatsBar.tsx`**

```tsx
import type { PortfolioDataPoint, Currency } from '../../types'
import { chartStats, absoluteChange } from './chartHelpers'
import { formatCurrency } from '../../lib/formatters'

export function ChartStatsBar({ data, currency }: { data: PortfolioDataPoint[]; currency: Currency }) {
  const { start, current, peak, low } = chartStats(data)
  const abs = absoluteChange(data)
  const fmt = (v: number | null) => (v == null ? '—' : formatCurrency(v, currency))

  const cells: { label: string; value: string; className: string }[] = [
    { label: 'START', value: fmt(start), className: 'text-text-secondary' },
    { label: 'CURRENT', value: fmt(current), className: 'text-gold' },
    { label: 'PEAK', value: fmt(peak), className: 'text-text-secondary' },
    { label: 'LOW', value: fmt(low), className: 'text-text-secondary' },
    {
      label: 'ABS. CHANGE',
      value: abs == null ? '—' : formatCurrency(Math.abs(abs), currency),
      className: abs == null ? 'text-text-secondary' : abs >= 0 ? 'text-green' : 'text-red',
    },
  ]

  return (
    <div className="flex items-stretch">
      {cells.map((c, i) => (
        <div key={c.label} className={`flex flex-1 flex-col items-center gap-1 py-3 ${i > 0 ? 'border-l border-border' : ''}`}>
          <span className="font-mono text-[9px] tracking-widest text-text-faint">{c.label}</span>
          <span className={`font-mono text-xs font-semibold ${c.className}`}>{c.value}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd cryptofolio-web && npx vitest run src/components/chart/ChartStatsBar.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp add cryptofolio-web/src/components/chart/TimeRangePicker.tsx cryptofolio-web/src/components/chart/ChartStatsBar.tsx cryptofolio-web/src/components/chart/ChartStatsBar.test.tsx
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp commit -m "feat(chart): TimeRangePicker and ChartStatsBar components

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Recharts chart component (`PortfolioChart.tsx`)

**Files:**
- Modify: `cryptofolio-web/package.json` (add `recharts`)
- Create: `cryptofolio-web/src/components/chart/PortfolioChart.tsx`

**Interfaces:**
- Produces: `PortfolioChart({ data, range, currency }: { data: PortfolioDataPoint[]; range: TimeRange; currency: Currency })` — Recharts area+line, gold when period ≥ 0 else red, X-axis `xTickLabel`, Y-axis `axisCurrency`, non-zero-based domain.
- Consumes: `recharts`; `periodChangePct`, `axisCurrency`, `xTickLabel` from `./chartHelpers`; `CURRENCY_META` from `../../lib/constants`.

- [ ] **Step 1: Install Recharts (latest major) and verify audit stays clean**

Run: `cd cryptofolio-web && npm install recharts@^3 && npm audit`
Expected: install succeeds; `npm audit` reports **0 vulnerabilities**. If audit reports issues introduced by recharts, stop and report back before proceeding (global constraint: audit must stay 0).

- [ ] **Step 2: Implement `PortfolioChart.tsx`**

```tsx
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import type { PortfolioDataPoint, TimeRange, Currency } from '../../types'
import { periodChangePct, axisCurrency, xTickLabel } from './chartHelpers'
import { CURRENCY_META } from '../../lib/constants'

export function PortfolioChart({
  data, range, currency,
}: { data: PortfolioDataPoint[]; range: TimeRange; currency: Currency }) {
  const positive = (periodChangePct(data) ?? 0) >= 0
  const color = positive ? 'var(--gold)' : 'var(--red)'
  const symbol = CURRENCY_META[currency].symbol
  const gradientId = 'chartFill'

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 12, right: 24, bottom: 8, left: 8 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--subtle-border)" vertical={false} />
        <XAxis
          dataKey="date" type="number" scale="time" domain={['dataMin', 'dataMax']}
          tickFormatter={(ms: number) => xTickLabel(ms, range)}
          tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--text-tertiary)' }}
          stroke="var(--subtle-border)"
        />
        <YAxis
          orientation="left" domain={['auto', 'auto']} width={56}
          tickFormatter={(v: number) => axisCurrency(v, symbol)}
          tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--text-tertiary)' }}
          stroke="var(--subtle-border)"
        />
        <Area
          type="monotone" dataKey="value" stroke={color} strokeWidth={2.5}
          fill={`url(#${gradientId})`} isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

Note: verify the CSS-var names against `cryptofolio-web/src/styles/globals.css` before writing — use the exact token names defined there (`--gold`, `--red`, `--subtle-border`, `--text-tertiary`, `--font-mono`). If a token has a different name, use the actual one; do not invent tokens.

- [ ] **Step 3: Verify build + typecheck**

Run: `cd cryptofolio-web && npx tsc -b`
Expected: PASS (no type errors). Visual verification happens in Task 12's browser run.

- [ ] **Step 4: Commit**

```bash
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp add cryptofolio-web/package.json cryptofolio-web/package-lock.json cryptofolio-web/src/components/chart/PortfolioChart.tsx
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp commit -m "feat(chart): Recharts portfolio chart component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: `PortfolioHistorySection` container + mount on `PortfolioPage`, then browser verify

**Files:**
- Create: `cryptofolio-web/src/components/chart/PortfolioHistorySection.tsx`
- Modify: `cryptofolio-web/src/routes/PortfolioPage.tsx`

**Interfaces:**
- Produces: `PortfolioHistorySection()` — collapsible (default expanded) section: header (title, `{range} CHANGE` %, refresh ↻, Show/Hide toggle, cached/updated status), `PortfolioChart`, `ChartStatsBar`, `TimeRangePicker`, plus loading/error/empty/stale states. Fetches on mount-while-expanded, on range change, and on currency change; refresh button calls `fetchHistoricalData(true)`.
- Consumes: store chart state/actions; `PortfolioChart`, `ChartStatsBar`, `TimeRangePicker`, `periodChangePct` from `./chartHelpers`; `asPercentChange` from `../../lib/formatters`; `RefreshCw`, `ChevronDown`, `ChevronUp` from `lucide-react`.

- [ ] **Step 1: Implement `PortfolioHistorySection.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { usePortfolioStore } from '../../store/portfolioStore'
import { PortfolioChart } from './PortfolioChart'
import { ChartStatsBar } from './ChartStatsBar'
import { TimeRangePicker } from './TimeRangePicker'
import { periodChangePct } from './chartHelpers'
import { asPercentChange } from '../../lib/formatters'

export function PortfolioHistorySection() {
  const holdings = usePortfolioStore((s) => s.holdings)
  const currency = usePortfolioStore((s) => s.currency)
  const range = usePortfolioStore((s) => s.selectedTimeRange)
  const data = usePortfolioStore((s) => s.historicalData)
  const isLoading = usePortfolioStore((s) => s.isLoadingChart)
  const status = usePortfolioStore((s) => s.chartLoadingStatus)
  const error = usePortfolioStore((s) => s.chartError)
  const isStale = usePortfolioStore((s) => s.chartIsStale)
  const setTimeRange = usePortfolioStore((s) => s.setTimeRange)
  const fetchHistoricalData = usePortfolioStore((s) => s.fetchHistoricalData)

  const [expanded, setExpanded] = useState(true)
  const coinKey = [...new Set(holdings.map((h) => h.coin.id))].sort().join(',')

  useEffect(() => {
    if (expanded && coinKey) fetchHistoricalData()
  }, [expanded, coinKey, range, currency, fetchHistoricalData])

  const pct = periodChangePct(data)
  const positive = (pct ?? 0) >= 0

  return (
    <div className="rounded-xl border border-border bg-card-bg">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-text-tertiary">PORTFOLIO HISTORY</span>
          {pct != null && (
            <span className={`font-mono text-sm font-bold ${positive ? 'text-green' : 'text-red'}`}>
              {range} {asPercentChange(pct)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {status ? (
            <span className="font-mono text-[9px] text-text-faint">{status}</span>
          ) : isStale ? (
            <span className="font-mono text-[9px] text-text-faint">cached — tap ↻ to refresh</span>
          ) : null}
          <button
            onClick={() => fetchHistoricalData(true)} disabled={isLoading}
            className="text-gold disabled:text-text-faint" aria-label="Refresh chart"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)} className="text-text-tertiary hover:text-text-primary"
            aria-label={expanded ? 'Hide chart' : 'Show chart'}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <div className="relative h-64 border-t border-border">
            {data.length > 0 ? (
              <>
                <PortfolioChart data={data} range={range} currency={currency} />
                {isStale && !isLoading && (
                  <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-[var(--gold-border)] bg-[var(--gold-card-bg)] px-3 py-1 font-mono text-[10px] text-gold">
                    Showing cached data — tap ↻ to refresh
                  </div>
                )}
              </>
            ) : isLoading ? (
              <div className="flex h-full items-center justify-center font-mono text-xs text-text-tertiary">Fetching chart data…</div>
            ) : error ? (
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <span className="font-mono text-xs text-text-tertiary">{error}</span>
                <button onClick={() => fetchHistoricalData(true)} className="font-mono text-xs text-gold">Retry</button>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center font-mono text-xs text-text-tertiary">
                {holdings.length === 0 ? 'Add holdings to see your chart' : 'No chart data yet'}
              </div>
            )}
          </div>
          <div className="border-t border-border">
            <ChartStatsBar data={data} currency={currency} />
          </div>
          <div className="flex justify-center border-t border-border px-5 py-3">
            <TimeRangePicker value={range} onChange={setTimeRange} />
          </div>
        </>
      )}
    </div>
  )
}
```

Note: verify `bg-card-bg`, `border-border`, `text-*`, `--gold-border`, `--gold-card-bg` exist in `tailwind.config.ts` / `globals.css` (they are used by existing components like `SegmentedControl` and cards). Use the real token names.

- [ ] **Step 2: Mount it on `PortfolioPage`**

In `cryptofolio-web/src/routes/PortfolioPage.tsx`, add the import and render the section below the holdings grids (inside the `flex flex-col gap-5` container, after the grid conditional block, before the closing `</div>` on line 46):

```tsx
import { PortfolioHistorySection } from '../components/chart/PortfolioHistorySection'
```

```tsx
        {holdings.length > 0 && <PortfolioHistorySection />}
```

- [ ] **Step 3: Full build + test suite**

Run: `cd cryptofolio-web && npm run build && npm test`
Expected: PASS — `tsc -b`, functions typecheck, vite build all succeed; all unit tests green.

- [ ] **Step 4: Real browser end-to-end verification**

Run: `cd cryptofolio-web && npm run dev` (serves the built SPA + Functions via `wrangler pages dev`). Then drive it in a browser (Playwright or manual) and confirm:
- Add a holding (e.g. 0.5 bitcoin on Coinbase) → chart section appears, expanded, and renders an area+line chart with real data.
- The header shows `{range} CHANGE` %; refresh ↻ spins while loading.
- Cycle 7D → 1M → 1Y → 5Y: each triggers a fetch and re-renders; X-axis labels change format per range.
- Toggle currency in Settings (USD ↔ EUR): chart refetches and Y-axis symbol changes.
- Collapse/expand with the chevron: collapsing hides the chart; expanding re-renders from cache instantly.
- Force a stale state (or wait past TTL) → the "Showing cached data" banner appears; ↻ clears it.
- Remove all holdings → section disappears (no chart fetch). Console is clean (no errors, no 403/uncaught).

Record the results in the progress ledger. If any check fails, treat it as a bug to fix before finishing (systematic-debugging).

- [ ] **Step 5: Commit**

```bash
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp add cryptofolio-web/src/components/chart/PortfolioHistorySection.tsx cryptofolio-web/src/routes/PortfolioPage.tsx
git -C /Users/pviegas/Documents/Crypto_portfolio_calculator/CryptoFolio_WebApp commit -m "feat(chart): inline collapsible portfolio history section on PortfolioPage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final steps (after all tasks)

- [ ] Run the full suite once more: `cd cryptofolio-web && npm run build && npm test && npm audit` — build green, all tests pass, audit = 0.
- [ ] Whole-branch review (opus) per the project's subagent-driven workflow, then merge to `main` with `git merge --no-ff` and delete the feature branch.
- [ ] Update memory: mark Phase 3 done in `cryptofolio-web-migration-status.md`; note Recharts added and the three folded-in Phase-2 minors resolved.

---

## Self-Review Notes

- **Spec coverage:** server `/api/history/[id]` (Task 3), client fetch (Task 7), localStorage cache mirroring `ChartCacheEntry` (Task 5), aggregation nearest-timestamp (Task 6), two-phase state machine incl. 429/never-blank (Task 8), inline collapsible UI + all states (Tasks 10-12), Recharts (Task 11), three folded-in cleanups (Tasks 1, 2, 4), tests + browser e2e (each task + Task 12) — all mapped.
- **Type consistency:** `HistoryPoint {ts,price}`, `PortfolioDataPoint {date:number,value}`, `ChartCacheEntry`, `HistoryResult`, `chartCacheKey`/`isCacheValid`/`CHART_TTL_MS`, `fetchCoinHistory(id,range,currency)`, `buildPortfolioDataPoints(coinHistories, amountByCoin)` are used identically across producing and consuming tasks.
- **Decision on `PortfolioDataPoint.date`:** changed from `Date` to `number` (ms epoch) — it was unused before Phase 3, and numeric time axes are what Recharts consumes. Documented in Task 5.
