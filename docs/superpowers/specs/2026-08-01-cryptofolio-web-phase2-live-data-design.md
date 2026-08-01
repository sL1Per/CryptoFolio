# CryptoFolio Web — Phase 2 (Live Data) Design

**Date:** 2026-08-01
**Status:** Approved for planning
**Builds on:** Phase 1 (foundation) — merged. Vite + React + TS SPA in `cryptofolio-web/`.

---

## Goal

Wire live CoinGecko data into the Phase 1 app: **prices** (USD + EUR, with 24h change) and
**coin images**, fetched through Cloudflare Pages Functions that cache responses server-side
to protect CoinGecko's free-tier rate limit. Portfolio values, 24h-change badges, and coin
logos go live; holdings CRUD, grouping/sorting, theme, and persistence are unchanged.

## Scope

**In:** `/api/prices` + `/api/images` Pages Functions with Cloudflare Cache API; a
`lib/coingecko.ts` client; a `fetchPrices` store action; on-change + manual-refresh triggers;
a header refresh button, a dismissible error banner, and first-load skeletons; local dev via
`wrangler pages dev` wrapping Vite.

**Out (deferred):** `/api/history/[id]` and charts (Phase 3); PWA/animations (Phase 4);
Supabase sync (Phase 5). This phase builds **no** history route and **no** chart code.

---

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Refresh cadence | On app mount + after add/edit holding + **manual refresh button**; no polling | Predictable low request volume, user controls freshness. |
| Currency switch | Re-renders instantly via selectors, **no fetch** | `prices` already carry both USD+EUR, so no new data is needed — cleaner and fewer requests than the native app's refetch. |
| Server cache | Cloudflare **Cache API** (`caches.default`) | Free, shared across visitors, no binding setup; correct for ephemeral Workers (the migration doc's in-memory `Map` does not work there). |
| Resilience on error | **Keep last-known values** client-side; server serves **stale-on-429** | Mirrors native "never blank on rate-limit"; protects all users when CoinGecko throttles globally. |
| First-load UX | Skeleton pulse on card value/change while first fetch is in flight and no prices exist | Lighter than a full-screen spinner; content-shaped. |
| Local dev | `wrangler pages dev -- <vite>` (one origin) | Prod parity; same-origin `/api` fetch with no proxy/CORS config. Bare `vite` documented as a UI-only fallback. |
| Images payload | Function returns a compact `{ [coinId]: imageUrl }` map | Smaller payload; keeps the client trivial. |

---

## Architecture

```
Browser — portfolioStore.fetchPrices()
   │  GET /api/prices?ids=bitcoin,ethereum        (same origin)
   │  GET /api/images?ids=bitcoin,ethereum
   ▼
Cloudflare Pages Functions (Workers runtime)
   functions/api/prices.ts   — proxy /simple/price,   fresh TTL 60s
   functions/api/images.ts   — proxy /coins/markets,  fresh TTL 24h
   │  Cache API (caches.default): serve fresh hit without upstream call;
   │  on stale, refetch; on upstream 429/error, serve retained stale copy.
   ▼
CoinGecko free API (no key)
```

The **client** owns portfolio logic (unchanged from Phase 1); the store just gains a fetch
action that fills `prices`/`coinImages`. The **Functions** are stateless caching proxies with
no business logic.

---

## Pages Functions

Both live under `cryptofolio-web/functions/api/` and export `onRequestGet`. They run on the
Workers runtime where `caches.default` and `fetch` are available; no env/secret needed (free
tier). Same-origin, so no CORS handling required.

### Shared caching pattern (both endpoints)

We cannot rely on the Cache API's own max-age eviction to also provide stale-on-error,
because `caches.default.match` won't return an entry past its `max-age`. So we store entries
with a **long retention** `Cache-Control: max-age` and track **logical freshness** ourselves
via a custom `x-cached-at` epoch-ms header on the cached response.

```
onRequestGet(ctx):
  reqUrl   = new URL(ctx.request.url)
  ids      = reqUrl.searchParams.get('ids')          // validate: non-empty, sane length
  cacheKey = new Request(canonicalUrl(ids))          // stable key from ids only
  cached   = await caches.default.match(cacheKey)

  if cached and age(cached) < FRESH_TTL:              // age from x-cached-at
     return cached (x-cache-status: fresh)

  try:
     upstream = await fetch(coingeckoUrl(ids))
     if upstream.status == 429: throw RateLimited
     if !upstream.ok:           throw UpstreamError(status)
     body   = transform(await upstream.json())         // prices: passthrough; images: {id:img}
     resp   = json(body, headers: {
                'Cache-Control': `public, max-age=${RETENTION}`,
                'x-cached-at': Date.now(), 'x-cache-status': 'miss' })
     ctx.waitUntil(caches.default.put(cacheKey, resp.clone()))
     return resp
  catch RateLimited or UpstreamError:
     if cached: return cached (x-cache-status: 'stale')     // shared stale-serve
     return json({ error: 'rate_limited' }, status 429)     // nothing to fall back to
```

- **`prices.ts`**: upstream `…/simple/price?ids={ids}&vs_currencies=usd,eur&include_24hr_change=true`.
  Response is already keyed by coin id with fields `usd,eur,usd_24h_change,eur_24h_change` →
  passthrough (matches the client `CoinPrice` type). `FRESH_TTL=60s`, `RETENTION=1h`.
- **`images.ts`**: upstream `…/coins/markets?vs_currency=usd&ids={ids}&per_page=250&sparkline=false`.
  Transform the array to `{ [m.id]: m.image }`. `FRESH_TTL=24h`, `RETENTION=7d`.
- **Validation:** reject missing/empty `ids` with 400; cap `ids` length to avoid abuse.
- **Cache key** is derived from the sorted `ids` (and endpoint), not the raw query string, so
  `?ids=b,a` and `?ids=a,b` share a cache entry.

---

## Client layer — `lib/coingecko.ts`

Thin `fetch` wrappers, same-origin, with a typed error so the store can distinguish rate
limiting from other failures:

```ts
export class RateLimitedError extends Error {}

export async function fetchPrices(ids: string[]): Promise<Record<string, CoinPrice>>
export async function fetchImages(ids: string[]): Promise<Record<string, string>>
// each: GET /api/{endpoint}?ids=<sorted,joined>; 429 → throw RateLimitedError;
// other non-2xx → throw Error; parse and return JSON.
```

---

## Store — `fetchPrices` action (ported from `PortfolioViewModel`)

Add to `portfolioStore.ts` (fields already exist from Phase 1: `prices`, `coinImages`,
`isLoading`, `lastUpdated`, `errorMessage`):

```
fetchPrices():
  ids = unique(holdings.map(h => h.coin.id))
  if ids empty: return
  set isLoading = true, errorMessage = null
  try:
     prices = await coingecko.fetchPrices(ids)         // REPLACE prices map
     set prices, lastUpdated = Date.now()
  catch RateLimitedError:
     set errorMessage = 'Rate limited — showing last known prices'   // KEEP existing prices
  catch:
     set errorMessage = 'Could not update prices — showing last known values'  // KEEP prices
  finally: set isLoading = false
  // images: fetch only for held coins missing an image; best-effort, never surfaces an error
  missing = ids.filter(id => !coinImages[id])
  if missing: try { merge(await coingecko.fetchImages(missing)) into coinImages } catch {}
```

Key ported rules: **never clear `prices` on error** (mirrors native), images are best-effort
and silent, `lastUpdated` only advances on a successful price fetch.

### Triggers
- **On mount:** `PortfolioPage` (or `App`) calls `fetchPrices()` once on first render.
- **After `addHolding` / `updateHolding`:** call `fetchPrices()` (new coin may need a price).
- **On `setCurrency`:** **no fetch** — `prices` already hold both usd+eur, so the selectors
  re-render the switched currency instantly. (Divergence from native, which refetched; ours is
  cheaper and equally correct.)
- **Manual:** header refresh button calls `fetchPrices()`.

Persistence unchanged: `partialize` still excludes `prices`/`coinImages` (re-fetched each load).

---

## UI changes (minimal edits to Phase 1 components)

- **`AppShell`**: add a refresh button (lucide `RefreshCw`) left of Settings; spins
  (`animate-spin`) and is `disabled` while `isLoading`; onClick → `fetchPrices()`.
- **Error banner**: a dismissible strip under the header, shown when `errorMessage` is set
  (amber, using theme tokens). Dismiss clears `errorMessage`. Last-known values remain visible.
- **First-load skeleton**: `TokenCard`/`HoldingCard` render a subtle pulse placeholder for the
  value + change when `isLoading && no price yet for that coin`; once prices arrive, real
  numbers show (selectors already compute them — no selector change).
- **Coin logos**: now populated via `coinImages` (already plumbed into `CoinImage` in Phase 1;
  logos render, letter fallback remains for any missing/broken image).
- **`TotalPortfolioCard`**: no code change — value/change light up once `prices` is populated.
- Exchange favicons already render client-side (Google CDN) — unchanged.

---

## Local dev + config

- `package.json` scripts:
  - `"dev:vite": "vite"`
  - `"dev": "wrangler pages dev -- npm run dev:vite"` — Wrangler serves the SPA + Functions on
    one origin; `/api/*` fetches resolve with no proxy config. (Exact flag wiring finalized in
    the plan.)
  - `"build"` unchanged; Functions are picked up by Pages from `functions/`.
  - Bare `npm run dev:vite` documented as a UI-only fallback (`/api` 404s there).
- `wrangler.toml` already present from Phase 1.

---

## Error handling summary

- **Server, upstream 429/error:** serve retained stale cache if present (shared protection),
  else 429 to client.
- **Client, `RateLimitedError` or other fetch failure:** keep last-known `prices`, set a
  human `errorMessage`, surface the dismissible banner. Never blanks the portfolio.
- **Images failure:** silent; letter-avatar fallback covers it.
- **Empty portfolio:** `fetchPrices` no-ops (no ids).

---

## Testing

- **Vitest — `lib/coingecko.ts`:** mock global `fetch`; assert success parsing, `429 →
  RateLimitedError`, other non-2xx → Error, correct `?ids=` (sorted) query.
- **Vitest — store `fetchPrices`:** mock the client; assert prices/images populate,
  `lastUpdated` advances on success, and on `RateLimitedError`/error the existing `prices` are
  RETAINED while `errorMessage` is set and `isLoading` resets.
- **Vitest — Functions:** unit-test the shared caching logic with a mocked `caches.default` +
  `fetch`: fresh-hit (no upstream call), stale refetch, stale-serve on upstream 429,
  cold 429 → 429, `ids` validation (400), images array→map transform, sorted-ids cache key.
- **Real browser smoke (Playwright), end of phase:** add a real coin (e.g. Bitcoin), confirm a
  live USD price, 24h-change color, and logo render; toggle USD/EUR; click refresh (spinner);
  and confirm last-known values persist if a fetch is forced to fail. Driven like Phase 1.

---

## Feature parity delta (Phase 2 rows)

Live prices USD+EUR ✅ · 24h change values ✅ · 20 coins with images ✅ · shared server-side
cache ✅ · rate-limit resilience (keep last-known) ✅ · manual refresh ✅. Deferred: historical
chart + chart caching (Phase 3).
