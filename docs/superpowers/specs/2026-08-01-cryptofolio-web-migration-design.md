# CryptoFolio Web Migration — Design

**Date:** 2026-08-01
**Status:** Approved for planning
**Source app:** SwiftUI CryptoFolio (native macOS/iOS)

---

## Goal

Port CryptoFolio from SwiftUI to a web app with **full feature parity** to the native app
(Phases 1–3 of `WEB_MIGRATION.md`), deployed to the **Cloudflare free tier**.

Out of scope for this spec: Phase 4 polish (PWA, Framer Motion animations) and Phase 5
(Supabase multi-device sync + auth). Those get their own spec/plan later.

---

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Frontend | **Vite + React + TypeScript SPA** | Client-heavy personal tool; SSR/SEO (the doc's reason for Next.js) adds no value here. Lighter and truly native to Cloudflare Pages. |
| Hosting | **Cloudflare Pages** (static) + **Pages Functions** (API proxy) | Free tier: unlimited static requests, 100k Function requests/day. |
| Server cache | **Cloudflare Cache API** | Free, unlimited, per-colo, no binding/namespace setup. Replaces the doc's in-memory `Map`, which does **not** work on ephemeral Workers. |
| Styling | Tailwind CSS + CSS variables | Maps 1:1 to `Theme.swift` tokens. |
| State | Zustand + `persist` middleware (localStorage) | Direct mirror of `PortfolioViewModel`; localStorage replaces `UserDefaults`. |
| Charts | Recharts | Area/line portfolio charts. |
| Icons | Lucide React | Matches doc. |
| Location | `cryptofolio-web/` subfolder | Alongside Swift sources; repo now git-initialized. |
| Deploy | Config + local run included; **no deploy to user's CF account** | Needs the user's Cloudflare login; user runs the final `wrangler pages deploy`. |

### Correction to WEB_MIGRATION.md

The doc's server proxy uses `const cache = new Map(...)`. On Cloudflare Workers this is
per-isolate and ephemeral — it is **not** shared across visitors and does not survive
between requests, so it provides no real rate-limit protection. This spec uses the
**Cloudflare Cache API** (`caches.default`) keyed by the request URL, with `Cache-Control`
max-age per endpoint. KV is a possible alternative but its free tier caps writes at
1k/day and requires namespace binding — unnecessary for this workload.

---

## Architecture

```
Browser — React SPA (Vite build)
  │   Zustand store (all portfolio logic), persisted to localStorage
  │   fetch → same-origin /api/*
  ▼
Cloudflare Pages Functions (Workers runtime)
  /api/prices          → CoinGecko /simple/price?ids=…&vs_currencies=usd,eur&include_24hr_change=true
  /api/images          → CoinGecko /coins/markets?ids=…
  /api/history/[id]    → CoinGecko /coins/{id}/market_chart?vs_currency=…&days=…
  │   shared server-side cache via Cloudflare Cache API (per-endpoint TTL)
  │   on 429: serve stale cache if present, else propagate 429
  ▼
CoinGecko free API
```

**Responsibility split**
- **Client** owns *all* domain logic — a faithful port of `PortfolioViewModel`: totals,
  24h change, sorting, token/exchange aggregation, currency formatting, and the two-phase
  chart-fetch state machine. Client keeps its own localStorage chart cache (mirrors the
  Swift `ChartCacheEntry` behavior).
- **Functions** are thin caching proxies. No business logic. They exist only to (a) hide
  CoinGecko behind a *shared* cache and (b) keep API traffic same-origin.

Two cache layers, by design: the **client** cache mirrors the native app's UX rules
("always show cache, never blank"); the **server** cache mirrors the doc's shared-rate-limit
upgrade. They are independent and complementary.

---

## Project layout

```
cryptofolio-web/
├── functions/
│   └── api/
│       ├── prices.ts            # proxy /simple/price, Cache API TTL 60s
│       ├── images.ts            # proxy /coins/markets, Cache API TTL 24h
│       └── history/[id].ts      # proxy /market_chart, TTL per range (see below)
├── src/
│   ├── main.tsx
│   ├── App.tsx                  # router: / and /chart
│   ├── routes/
│   │   ├── PortfolioPage.tsx    # main view (ContentView)
│   │   └── ChartPage.tsx        # /chart (separate window → route)
│   ├── components/
│   │   ├── portfolio/           # TotalPortfolioCard, ControlBar, HoldingCard, TokenCard,
│   │   │                        #   TokenBreakdownModal, FlatHoldingsGrid,
│   │   │                        #   TokenGroupedGrid, ExchangeGroupedGrid
│   │   ├── chart/               # PortfolioChart, StatsBar, TimeRangePicker
│   │   ├── modals/              # AddHoldingModal, SettingsModal
│   │   └── ui/                  # CoinImage, ExchangeBadge, ChangeBadge, SectionHeader
│   ├── store/
│   │   ├── portfolioStore.ts    # Zustand — mirrors PortfolioViewModel
│   │   └── themeStore.ts        # appearance mode (dark/light/system)
│   ├── lib/
│   │   ├── coingecko.ts         # client fns hitting /api/*
│   │   ├── cache.ts             # localStorage chart cache (mirrors ChartCacheEntry)
│   │   ├── formatters.ts        # format(), asPercentChange
│   │   └── constants.ts         # POPULAR_COINS (20), EXCHANGES (13)
│   ├── types/
│   │   └── index.ts             # ported from Models.swift
│   └── styles/
│       └── globals.css          # CSS variables ported from Theme.swift
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── wrangler.toml                # Pages + Functions config for local dev + deploy
```

---

## Data model (ported from Models.swift)

Types per `WEB_MIGRATION.md` §"Type definitions", verified against `Models.swift`:
`Coin`, `Exchange` (with computed `logoUrl` = Google favicon CDN), `Holding`
(`id = crypto.randomUUID()`), `AggregatedHolding`, `CoinPrice`
(`usd`, `eur`, `usd_24h_change`, `eur_24h_change`), `PortfolioDataPoint`.
Enums as string unions: `Currency`, `TimeRange`, `GroupMode`, `SortMode`, `AppearanceMode`.

**Constants** (`lib/constants.ts`) copied verbatim from `Models.swift`:
- `POPULAR_COINS` — the 20 coins (bitcoin…aave) with exact CoinGecko ids.
- `EXCHANGES` — the 13 exchanges with `id`, `name`, `color` (hex, no `#`), `domain`.
  `logoUrl` computed as `https://www.google.com/s2/favicons?domain={domain}&sz=64`.
- `TimeRange.days`: 7D→7, 1M→30, 1Y→365, 5Y→1825.

---

## Store (mirrors PortfolioViewModel)

State + actions per `WEB_MIGRATION.md` §"Zustand store", verified against
`PortfolioViewModel.swift`. Key ported behaviors:

- **Actions:** `addHolding`, `update(holding)`, `remove(holding)`, `setCurrency`,
  `fetchPrices`, `fetchHistoricalData(forceRefresh?)`.
- **Selectors (computed, not stored):** `totalValue`, `totalChange24h`, `sortedHoldings`,
  `holdingsByExchange`, `holdingsByToken`. Sorting respects `sortMode`
  (value / name / 24h change) exactly as in the Swift `sorted` closures.
- **Currency helpers:** `price(for:)` / `dailyChange(for:)` switch on `currency`;
  `format()` uses `Intl.NumberFormat` (currency style, `maximumFractionDigits = value < 1 ? 6 : 2`).
- **Persistence:** `holdings` and the chart cache persist to localStorage
  (keys mirror `cryptofolio_holdings_v2`, `cryptofolio_chartcache_v1`); `currency`
  persists too. `persist` middleware handles rehydration on load.

---

## Chart fetch — faithful port of the two-phase state machine

This is the most intricate logic and must match `fetchHistoricalData` exactly:

1. **Render cache first, always.** Build portfolio history from *whatever* is in the
   localStorage chart cache (ignoring TTL) and display it immediately. Set `chartCachedAt`
   to the oldest shown entry's timestamp; set `chartIsStale` if any needed coin is missing
   or past its TTL. Clear any prior hard error once we have data.
2. **Determine stale/missing coins** using cache key `"coinId|currency|range"` and per-range
   TTL: 7D→10min, 1M→1h, 1Y→6h, 5Y→24h. `forceRefresh` bypasses TTL.
3. **Fetch stale coins sequentially**, 1.5s apart. On each success: write cache entry, save,
   re-render accumulated history. **On 429:** show "waiting 15s", wait, retry once; if the
   retry also fails, stop and keep showing what we have. Only set an error banner if
   `historicalData` is empty (nothing to show).
4. **Never blank the chart.** Errors surface only when there is no cached/fetched data at all.

**Portfolio aggregation** (`buildPortfolioDataPoints`): use the longest coin history as the
reference timestamp axis; for each coin, look up exact timestamp else nearest-timestamp price;
sum `price × totalAmount` across held coins; emit a point only if at least one coin
contributed. Ported precisely to preserve chart shape.

**Server side** (`/api/history/[id].ts`): proxy `market_chart`, cache response in the
Cloudflare Cache API with max-age matching the range TTL; on upstream 429 return cached copy
if present, else 429 so the client runs its retry logic.

---

## Styling

`styles/globals.css` defines CSS variables ported verbatim from `Theme.swift` (light in
`:root`, dark under `.dark`), including gold `#ffc850`, `--green #00d97e`, `--red #ff4d6d`,
and the `--font-mono` stack. Tailwind config references the variables so components use
semantic classes. `themeStore` toggles the `.dark` class on `<html>`; `system` mode follows
`prefers-color-scheme`. Preserves the dark terminal aesthetic with gold accents and
monospaced fonts.

---

## Error handling

- **Prices 429:** store sets `errorMessage` ("Rate limited — wait a moment"); existing prices
  stay on screen.
- **Chart 429:** handled by the two-phase machine above (stale cache + 15s retry + graceful stop).
- **Network/parse errors:** surfaced only when no data is available to display.
- **Missing coin image:** `CoinImage` falls back to a letter avatar (`onError`), mirroring
  `CoinImageView`.
- **Function upstream failure:** proxies serve stale Cache API copy where possible; otherwise
  propagate the status so the client decides.

---

## Verification / testing

- **Vitest unit tests** for the pure, error-prone logic:
  - totals (`totalValue`, `totalChange24h`), sorting for all 3 `sortMode`s,
    `holdingsByToken` / `holdingsByExchange` aggregation.
  - `formatters` (currency fraction-digit rule, `asPercentChange` sign/precision).
  - cache validity + staleness rules (TTL per range, cache-key format).
  - `buildPortfolioDataPoints` nearest-timestamp behavior with mismatched-length histories.
- **Local end-to-end:** `wrangler pages dev` (serves SPA + Functions together) — verify
  add/edit/remove holding, group/sort modes, live prices in USD/EUR, chart across all 4
  ranges, stale-cache banner, and dark/light/system theme.
- **Deploy config** (`wrangler.toml`) included and documented; the user runs the final
  `wrangler pages deploy` against their own Cloudflare account.

---

## Feature parity target (Phases 1–3)

Live prices (USD+EUR) · add/edit/remove holdings · 13 exchanges w/ logos · 20 coins w/ images
· token/exchange/all group modes · value/name/24h-change sort · 2-column card grid · token
breakdown modal · historical chart 7D/1M/1Y/5Y · chart caching w/ staleness · dark/light/system
theme · local persistence. **Deferred:** multi-device sync (Phase 5), PWA/animations (Phase 4).
