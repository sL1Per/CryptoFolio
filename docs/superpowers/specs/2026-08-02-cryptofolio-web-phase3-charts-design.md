# CryptoFolio Web — Phase 3: Historical Charts (Design)

**Date:** 2026-08-02
**Status:** Approved — proceeding to implementation plan
**Prior phases:** Phase 1 (foundation) and Phase 2 (live data) complete and merged to `main`.
**Reference:** native `PortfolioChartView.swift` + `PortfolioViewModel.fetchHistoricalData`
(archived Swift source); overview in `docs/superpowers/specs/2026-08-01-cryptofolio-web-migration-design.md`.

---

## Goal

Port the native portfolio-history chart to the web app as a **collapsible inline section**
on the portfolio page (default **expanded**), backed by a new `/api/history/[id]` caching
proxy and a faithful port of the native two-phase chart-fetch state machine. Fold in three
small deferred Phase-2 cleanups.

**Feature parity target:** historical chart with 7D / 1M / 1Y / 5Y ranges, area+line rendering
with directional coloring, START/CURRENT/PEAK/LOW/ABS-CHANGE stats, period-change %,
cache-first "never blank" behavior, and graceful 429 handling.

---

## Decisions (from brainstorming)

1. **Presentation:** inline section on `PortfolioPage`, below the holdings grids (NOT a
   separate `/chart` route or modal). No new route, so no SPA catch-all needed.
2. **Collapsible, default expanded:** a Show/Hide toggle; fetches on first mount/expand.
   Cache-first render keeps this cheap — "fetches on load" means "refresh only coins past
   their per-range TTL," bounded by the cache.
3. **Fold in three Phase-2 cleanups:** tsc-check Functions tests, distinguish 429 vs other
   upstream errors in `cacheProxy`, add a runtime guard to a transform.
4. **Chart library:** Recharts (latest major), per the migration doc and parity target.

---

## Architecture

```
PortfolioPage
  └── PortfolioHistorySection (collapsible, default expanded)
        ├── header: title · {range} CHANGE % · refresh ↻ · show/hide toggle
        ├── PortfolioChart      (Recharts area+line)
        ├── ChartStatsBar       (START/CURRENT/PEAK/LOW/ABS CHANGE)
        └── TimeRangePicker     (7D/1M/1Y/5Y)

  store.fetchHistoricalData()  ── two-phase state machine ──►  lib/coingecko.fetchCoinHistory()
        │  reads/writes                                              │  fetch same-origin
        ▼                                                            ▼
  lib/cache.ts (localStorage chart cache)                  /api/history/[id]  (Pages Function)
        │  pure aggregation                                          │  cacheProxy + Cache API
        ▼                                                            ▼
  lib/portfolioHistory.buildPortfolioDataPoints()          CoinGecko /coins/{id}/market_chart
```

**Responsibility split** (unchanged from prior phases): the client owns all domain logic
(the state machine, aggregation, caching UX); the Function is a thin caching proxy with no
business logic.

---

## 1. Server — `functions/api/history/[id].ts`

A Cloudflare Pages Function reusing the existing `functions/api/_lib/cacheProxy.ts` core.

- **Route:** `/api/history/:id?days={7|30|365|1825}&vs={usd|eur}`
- **Validation:**
  - `id` — matched against a safe charset (lowercase alphanumeric + dashes); reject others.
  - `days` — restricted to the four allowed values.
  - `vs` — `usd` or `eur`.
  - Invalid input → `400` (do not forward junk to CoinGecko).
- **Upstream:** `https://api.coingecko.com/api/v3/coins/{id}/market_chart?vs_currency={vs}&days={days}`,
  sent with the **descriptive `User-Agent`** header (the Phase-2 403 lesson — reuse the same
  upstream fetch helper as `prices`/`images`).
- **Transform:** reduce CoinGecko's `{ prices, market_caps, total_volumes }` to
  `{ prices: [ts, price][] }`, with a **runtime guard** (drop/skip if `prices` is not an array
  of numeric pairs).
- **Cache TTL per range** (edge Cache API `freshTtlMs`, matching client TTLs):
  7D → 10 min, 1M → 1 h, 1Y → 6 h, 5Y → 24 h. Longer `retentionSecs` for stale-serving.
- **429 behavior:** on upstream 429, serve the stale cached copy if present; otherwise
  propagate `429` so the client runs its retry logic.
- **Browser cache:** `Cache-Control: no-store` to the browser (Phase-2 lesson — long max-age
  only on the edge copy), so force-refresh works.

---

## 2. Client data layer

### `lib/coingecko.ts` (extend)
Add `fetchCoinHistory(id, range, currency)` → returns a **discriminated result**:
`{ ok: true, data: { ts, price }[] }` | `{ ok: false, rateLimited: true }` |
`{ ok: false, rateLimited: false }`. The store's state machine branches on this.

### `lib/cache.ts` (new)
localStorage chart cache mirroring the native `ChartCacheEntry`, **isolated from the Zustand
persist blob** (its own key, matching native):
- **Storage key:** `cryptofolio_chartcache_v1`
- **Entry:** `{ coinId, currency, range, data: [ts, price][], fetchedAt }`
- **Cache key:** `"coinId|currency|range"`
- **TTL per range:** 7D → 10 min, 1M → 1 h, 1Y → 6 h, 5Y → 24 h.
- `isCacheValid(entry, range)`, plus array serialize / load helpers.

### `lib/portfolioHistory.ts` (new, pure)
`buildPortfolioDataPoints(coinHistories, amountByCoin)` — ported precisely from the Swift
`buildPortfolioDataPoints`:
- Use the **longest** coin history as the reference timestamp axis.
- For each reference timestamp, per coin use the exact-timestamp price, else the
  **nearest-timestamp** price.
- Sum `price × amount` across held coins.
- Emit a point only if **at least one coin contributed**.
- Returns `{ date, value }[]` (date as ms epoch).

---

## 3. Store additions (`portfolioStore.ts`) — transient (not persisted)

**State:** `selectedTimeRange` (default `'7D'`), `historicalData: PortfolioDataPoint[]`,
`isLoadingChart`, `chartError: string | null`, `chartLoadingStatus`,
`chartCachedAt: number | null`, `chartIsStale`.

**Actions:**
- `setTimeRange(range)` — set range (triggers a refetch from the UI effect).
- `fetchHistoricalData(forceRefresh?)` — faithful two-phase machine:

1. **Render cache first, always** (ignore TTL). Build `historicalData` from whatever is in
   the localStorage cache; set `chartCachedAt` to the oldest shown entry's `fetchedAt`;
   set `chartIsStale = true` if any needed coin is missing or past TTL; clear any hard error
   once data exists.
2. **Determine stale/missing coins** using the `"coinId|currency|range"` key and per-range
   TTL. `forceRefresh` bypasses TTL. If none stale → clear loading/status, done.
3. **Fetch stale coins sequentially, 1.5 s apart.** Each success: write the cache entry, save,
   re-render accumulated history, update `chartCachedAt`. **On 429:** set status
   "Rate limited — waiting 15 s to retry…", wait 15 s, retry that coin once; if the retry
   also fails, **stop** and keep showing what we have. Set `chartError` **only if**
   `historicalData` is empty.
4. **Never blank the chart.** Errors surface only when there is no data at all.
5. On finish: clear `isLoadingChart`/`chartLoadingStatus`; recompute `chartIsStale`.

**Empty holdings:** `historicalData = []`, return early (mirrors native guard).

---

## 4. UI — `components/chart/`

- **`PortfolioHistorySection.tsx`** — collapsible container (default expanded). Header: title
  `PORTFOLIO HISTORY`, `{range} CHANGE` % (arrow + colored), refresh ↻ (spins while loading),
  show/hide toggle, and a "Cached … ago" / "Updated …" / loading-status line mirroring native.
  Fetches on first expand, on `selectedTimeRange` change, and on `currency` change (currency is
  part of the cache key, so switching currency naturally re-evaluates staleness and refetches).
- **`PortfolioChart.tsx`** — Recharts `AreaChart` + line: gradient fill (line color → transparent),
  **natural** interpolation (≈ catmullRom), **gold when period change ≥ 0, red when negative**,
  X-axis formatted per range (`EEE d` / `MMM d` / `MMM yy` / `yyyy`), Y-axis with `K`/`M` +
  currency symbol, non-zero-based domain. Colors via CSS vars (theme-aware).
- **`ChartStatsBar.tsx`** — five cells with vertical dividers: START · CURRENT (gold) · PEAK ·
  LOW · ABS. CHANGE (green/red by sign). Values `—` when no data.
- **`TimeRangePicker.tsx`** — 7D / 1M / 1Y / 5Y, reusing the existing `SegmentedControl` /
  gold-pill styling.
- **States:** loading ("Fetching chart data…"), error (message + Retry → force-refresh),
  empty ("Add holdings to see your chart"), and a stale banner
  ("Showing cached data — tap ↻ to refresh") overlaid when stale and not loading.
- **Integration:** mounted in `PortfolioPage.tsx` below the holdings grids.

---

## 5. Folded-in Phase-2 cleanups

- **tsc-check Functions:** include `functions/**/*.test.ts` in the Functions tsc build so the
  new `history/[id].ts` and its tests are type-checked (Phase-2's TS2493 slipped through
  because Function tests weren't compiled).
- **cacheProxy 429 vs error:** on upstream failure, label `429` as `rate_limited` and other
  failures as `upstream_error` (in body + `x-cache-status`), instead of labeling everything
  `rate_limited`.
- **transform runtime guard:** add a runtime guard to the transform(s) so malformed upstream
  JSON degrades gracefully rather than throwing (applied to the new history transform and the
  existing images transform).

---

## 6. Types / constants

- `TimeRange` string union `'7D' | '1M' | '1Y' | '5Y'` with a `days` map
  (7D→7, 1M→30, 1Y→365, 5Y→1825) in `types/index.ts` / `constants.ts`.
- `PortfolioDataPoint = { date: number; value: number }`.
- `ChartCacheEntry` type for the localStorage cache.

---

## 7. Testing (TDD, then real browser)

**Unit (Vitest):**
- `portfolioHistory` — nearest-timestamp lookup, mismatched-length histories, skipping
  points with zero contribution.
- `cache` — per-range TTL, `"coinId|currency|range"` key format, valid/stale detection,
  serialize/load round-trip.
- `coingecko.fetchCoinHistory` — success shape, 429 → `rateLimited`, other error.
- store `fetchHistoricalData` — cache-first render, stale detection, sequential fetch with
  1.5 s spacing, 429 → wait 15 s → retry once → stop, **never blank**, error only when empty
  (fake timers).
- `cacheProxy` — 429 vs other-error labeling.
- `history` Function — id/days/vs validation (incl. 400s), transform + guard, User-Agent.

**End-to-end (`wrangler pages dev`):** expand chart, cycle all 4 ranges, toggle currency,
observe stale banner, force-refresh, empty-state with no holdings, console clean.

---

## 8. Out of scope (deferred)

- Remaining Phase-1 minors (AddHoldingModal form reset, currency persist-key drift,
  light-mode flash-on-reload).
- Phase 4 (PWA / animations) and Phase 5 (Supabase multi-device sync).
